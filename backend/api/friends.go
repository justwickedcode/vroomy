package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	minSearchLen     = 2
	maxSearchLen     = 64
	maxSearchResults = 10
)

// Friend is another player as seen from the caller: who they are, a couple of headline stats,
// and where the two of them stand ("friends", "incoming", "outgoing", or "none" in search).
type Friend struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
	CarModel    string `json:"carModel"`
	BestWPM     int    `json:"bestWpm"`
	RacesPlayed int    `json:"racesPlayed"`
	Status      string `json:"status"`
}

// FriendsResponse is returned by GET /api/users/me/friends and by every friend mutation, so the
// client can replace its cached copy wholesale after any change.
type FriendsResponse struct {
	Friends  []Friend `json:"friends"`
	Incoming []Friend `json:"incoming"`
	Outgoing []Friend `json:"outgoing"`
}

// friendColumns selects a Friend for the user aliased u. $1 is always the caller's id, and f is
// the friendship row between the caller and u (NULL in search results with no relationship).
const friendColumns = `
	u.id, u.display_name, COALESCE(u.avatar_url, ''), u.car_model,
	COALESCE((SELECT MAX(wpm) FROM race_results WHERE user_id = u.id), 0)::int,
	(SELECT COUNT(*) FROM race_results WHERE user_id = u.id)::int,
	CASE
		WHEN f.status IS NULL THEN 'none'
		WHEN f.status = 'accepted' THEN 'friends'
		WHEN f.requester_id = $1 THEN 'outgoing'
		ELSE 'incoming'
	END`

func scanFriends(rows pgx.Rows) ([]Friend, error) {
	defer rows.Close()
	out := []Friend{}
	for rows.Next() {
		var f Friend
		if err := rows.Scan(&f.ID, &f.DisplayName, &f.AvatarURL, &f.CarModel, &f.BestWPM, &f.RacesPlayed, &f.Status); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func loadFriends(ctx context.Context, pool *pgxpool.Pool, userID string) (FriendsResponse, error) {
	rows, err := pool.Query(ctx, `
		SELECT `+friendColumns+`
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
		WHERE f.requester_id = $1 OR f.addressee_id = $1
		ORDER BY LOWER(u.display_name)
	`, userID)
	if err != nil {
		return FriendsResponse{}, err
	}
	all, err := scanFriends(rows)
	if err != nil {
		return FriendsResponse{}, err
	}

	resp := FriendsResponse{Friends: []Friend{}, Incoming: []Friend{}, Outgoing: []Friend{}}
	for _, f := range all {
		switch f.Status {
		case "friends":
			resp.Friends = append(resp.Friends, f)
		case "incoming":
			resp.Incoming = append(resp.Incoming, f)
		case "outgoing":
			resp.Outgoing = append(resp.Outgoing, f)
		}
	}
	return resp, nil
}

// writeFriends answers a friends request or mutation with the caller's current friends
// list — the shared tail of every handler in this file.
func writeFriends(w http.ResponseWriter, ctx context.Context, pool *pgxpool.Pool, userID string) {
	resp, err := loadFriends(ctx, pool, userID)
	if err != nil {
		log.Printf("loadFriends failed: %s\n", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleGetFriends serves GET /api/users/me/friends.
func handleGetFriends(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		writeFriends(w, r.Context(), pool, id.id)
	})
}

// handleSearchUsers serves GET /api/users/search?q=... — a forgiving match on display name (or an
// exact email or player id; see usersearch.go), excluding the caller, best matches first, with
// each result's relationship to the caller.
func handleSearchUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len(q) < minSearchLen || len(q) > maxSearchLen {
			writeError(w, http.StatusBadRequest, "q must be 2-64 characters")
			return
		}

		// Every player is a candidate (see usersearch.go for how they're matched), then the best
		// matches are loaded in full.
		ctx := r.Context()
		rows, err := pool.Query(ctx, `
			SELECT id, display_name, COALESCE(email, '') FROM users
			WHERE id <> $1 ORDER BY updated_at DESC LIMIT $2
		`, id.id, maxSearchCandidates)
		if err != nil {
			log.Printf("search users failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		candidates, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (searchCandidate, error) {
			var c searchCandidate
			err := row.Scan(&c.id, &c.displayName, &c.email)
			return c, err
		})
		if err != nil {
			log.Printf("scan search candidates failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		ids := rankSearch(candidates, q, maxSearchResults)

		rows, err = pool.Query(ctx, `
			SELECT `+friendColumns+`
			FROM users u
			LEFT JOIN friendships f
				ON (f.requester_id = $1 AND f.addressee_id = u.id)
				OR (f.addressee_id = $1 AND f.requester_id = u.id)
			WHERE u.id = ANY($2)
		`, id.id, ids)
		if err != nil {
			log.Printf("search users failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		found, err := scanFriends(rows)
		if err != nil {
			log.Printf("scan search results failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		// Back in match order.
		byID := make(map[string]Friend, len(found))
		for _, f := range found {
			byID[f.ID] = f
		}
		results := make([]Friend, 0, len(ids))
		for _, id := range ids {
			if f, ok := byID[id]; ok {
				results = append(results, f)
			}
		}
		writeJSON(w, http.StatusOK, results)
	})
}

type friendRequest struct {
	UserID string `json:"userId"`
}

// handleAddFriend serves POST /api/users/me/friends {"userId": "..."}. Sends a request, or — if
// that person already sent the caller one — accepts it, so "add" from either side always ends
// in a friendship. Calling it again for an existing request or friendship is a no-op.
func handleAddFriend(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var req friendRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == "" {
			writeError(w, http.StatusBadRequest, "userId is required")
			return
		}
		if req.UserID == id.id {
			writeError(w, http.StatusBadRequest, "you can't add yourself")
			return
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)`, req.UserID).Scan(&exists); err != nil {
			log.Printf("check friend target failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !exists {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		// ON CONFLICT with no target covers both the primary key and the pair index, so an
		// existing relationship in either direction leaves this a no-op.
		tag, err := pool.Exec(ctx, `
			INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, id.id, req.UserID)
		if err != nil {
			log.Printf("insert friendship failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if tag.RowsAffected() == 0 {
			// Already related. If they asked first, this is the caller saying yes.
			if _, err := pool.Exec(ctx, `
				UPDATE friendships SET status = 'accepted'
				WHERE requester_id = $2 AND addressee_id = $1 AND status = 'pending'
			`, id.id, req.UserID); err != nil {
				log.Printf("accept via add failed: %s\n", err)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
		}
		writeFriends(w, ctx, pool, id.id)
	})
}

// handleAcceptFriend serves POST /api/users/me/friends/{id}/accept.
func handleAcceptFriend(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		ctx := r.Context()
		tag, err := pool.Exec(ctx, `
			UPDATE friendships SET status = 'accepted'
			WHERE requester_id = $2 AND addressee_id = $1 AND status = 'pending'
		`, id.id, r.PathValue("id"))
		if err != nil {
			log.Printf("accept friendship failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "no pending request from that user")
			return
		}
		writeFriends(w, ctx, pool, id.id)
	})
}

// handleRemoveFriend serves DELETE /api/users/me/friends/{id} — one endpoint for unfriending,
// declining an incoming request, and cancelling an outgoing one, since all three just end the
// relationship.
func handleRemoveFriend(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		ctx := r.Context()
		tag, err := pool.Exec(ctx, `
			DELETE FROM friendships
			WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)
		`, id.id, r.PathValue("id"))
		if err != nil {
			log.Printf("delete friendship failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, http.StatusNotFound, "no relationship with that user")
			return
		}
		writeFriends(w, ctx, pool, id.id)
	})
}
