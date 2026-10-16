package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// shopPricesJSON is the garage catalog: item id → price in coins, 0 for the free starters. The
// frontend ships an identical copy (frontend/src/lib/shop/prices.json) so the shop renders
// without a round trip; TestShopPricesMatchFrontend fails if the two ever drift apart. This copy
// is the one that counts — purchases are priced here, never by the client.
//
//go:embed shop_prices.json
var shopPricesJSON []byte

var shopPrices = mustLoadPrices(shopPricesJSON)

func mustLoadPrices(raw []byte) map[string]int {
	var prices map[string]int
	if err := json.Unmarshal(raw, &prices); err != nil {
		panic("shop_prices.json: " + err.Error())
	}
	return prices
}

// coinsForRace is what one finished race pays: 10 for finishing, a quarter of your WPM, a
// podium bonus when there was someone to beat, and a little extra for the daily challenge so
// it's worth coming back for. A 50 WPM win against bots pays about 42 coins, so a mid-priced
// car (400-600) is an evening of racing and the Lambo is a real goal. The frontend mirrors this
// for guests (frontend/src/lib/shop/index.ts) and the coins migration uses it for back pay.
func coinsForRace(req raceRequest) int {
	coins := 10 + int(math.Round(float64(req.WPM)/4))
	if req.RacerCount > 1 {
		switch req.Placement {
		case 1:
			coins += 20
		case 2:
			coins += 10
		case 3:
			coins += 5
		}
	}
	if req.Mode == "daily" {
		coins += 15
	}
	return coins
}

// owns reports whether a player with the given purchases may use itemID. Free items (and ids
// the catalog doesn't know, which validation elsewhere rejects) count as owned.
func owns(owned []string, itemID string) bool {
	price, known := shopPrices[itemID]
	return !known || price == 0 || slices.Contains(owned, itemID)
}

// cosmeticsOwned checks that every item a cosmetics update would equip is one the player has
// bought, so the shop can't be skipped by sending a PUT directly.
func cosmeticsOwned(owned []string, req cosmeticsRequest) bool {
	return owns(owned, "car:"+req.CarModel) &&
		owns(owned, "trail:"+req.Trail) &&
		owns(owned, "powerup:"+req.EquippedPowerup) &&
		(!req.Underglow || owns(owned, "underglow"))
}

type purchaseRequest struct {
	ItemID string `json:"itemId"`
}

var (
	errAlreadyOwned  = errors.New("already owned")
	errNotEnoughCoin = errors.New("not enough coins")
)

// handlePurchase serves POST /api/users/me/purchases {"itemId": "car:lambo"}: spends the item's
// catalog price and records ownership, in one conditional UPDATE so two purchases racing each
// other can never overspend the balance or buy the same thing twice.
func handlePurchase(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var req purchaseRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		price, known := shopPrices[req.ItemID]
		if !known {
			writeError(w, http.StatusBadRequest, "unknown item")
			return
		}
		if price == 0 {
			writeError(w, http.StatusBadRequest, "that item is free")
			return
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		err := buyItem(ctx, pool, id.id, req.ItemID, price)
		switch {
		case errors.Is(err, errAlreadyOwned):
			writeError(w, http.StatusConflict, "you already own that")
			return
		case errors.Is(err, errNotEnoughCoin):
			writeError(w, http.StatusPaymentRequired, "not enough coins")
			return
		case err != nil:
			log.Printf("purchase failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		profile, err := loadFullProfile(ctx, pool, id.id)
		if err != nil {
			log.Printf("loadFullProfile failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})
}

func buyItem(ctx context.Context, pool *pgxpool.Pool, userID, itemID string, price int) error {
	var coins int
	err := pool.QueryRow(ctx, `
		UPDATE users SET coins = coins - $3, owned = array_append(owned, $2), updated_at = NOW()
		WHERE id = $1 AND coins >= $3 AND NOT ($2 = ANY(owned))
		RETURNING coins
	`, userID, itemID, price).Scan(&coins)
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	// Nothing updated: work out which condition failed, for a useful error.
	var owned []string
	if err := pool.QueryRow(ctx, `SELECT owned FROM users WHERE id = $1`, userID).Scan(&owned); err != nil {
		return err
	}
	if slices.Contains(owned, itemID) {
		return errAlreadyOwned
	}
	return errNotEnoughCoin
}
