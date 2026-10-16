package main

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// The frontend renders prices from its own copy of the catalog; the server charges from this
// one. They must be identical or the garage would show one price and charge another.
func TestShopPricesMatchFrontend(t *testing.T) {
	frontend, err := os.ReadFile("../../frontend/src/lib/shop/prices.json")
	if err != nil {
		t.Fatalf("read frontend prices: %v", err)
	}
	if !bytes.Equal(bytes.TrimSpace(frontend), bytes.TrimSpace(shopPricesJSON)) {
		var fe map[string]int
		_ = json.Unmarshal(frontend, &fe)
		for id, p := range shopPrices {
			if fe[id] != p {
				t.Errorf("%s: api charges %d, frontend shows %d", id, p, fe[id])
			}
		}
		for id := range fe {
			if _, ok := shopPrices[id]; !ok {
				t.Errorf("%s: in frontend prices but not api's", id)
			}
		}
		t.Fatal("backend/api/shop_prices.json and frontend/src/lib/shop/prices.json differ")
	}
}

func TestStartersAreFree(t *testing.T) {
	for _, id := range []string{"car:sport", "trail:nitro", "powerup:boost"} {
		if shopPrices[id] != 0 {
			t.Errorf("%s should be free (it's the default every new player starts with), costs %d", id, shopPrices[id])
		}
	}
}

func TestCoinsForRace(t *testing.T) {
	cases := []struct {
		name string
		req  raceRequest
		want int
	}{
		{"solo win at 50 wpm", raceRequest{WPM: 50, Placement: 1, RacerCount: 5, Mode: "solo"}, 10 + 13 + 20},
		{"third place", raceRequest{WPM: 40, Placement: 3, RacerCount: 5, Mode: "solo"}, 10 + 10 + 5},
		{"last place", raceRequest{WPM: 40, Placement: 5, RacerCount: 5, Mode: "solo"}, 10 + 10},
		{"daily (alone, no podium)", raceRequest{WPM: 60, Placement: 1, RacerCount: 1, Mode: "daily"}, 10 + 15 + 15},
		{"zero wpm still pays for finishing", raceRequest{WPM: 0, Placement: 2, RacerCount: 2, Mode: "multiplayer"}, 10 + 10},
	}
	for _, c := range cases {
		if got := coinsForRace(c.req); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestCosmeticsOwned(t *testing.T) {
	free := cosmeticsRequest{CarModel: "sport", Trail: "nitro", EquippedPowerup: "boost", UnderglowColor: "#fff"}
	if !cosmeticsOwned(nil, free) {
		t.Error("free starters should never need buying")
	}

	lambo := free
	lambo.CarModel = "lambo"
	if cosmeticsOwned(nil, lambo) {
		t.Error("equipping an unbought Lambo should be refused")
	}
	if !cosmeticsOwned([]string{"car:lambo"}, lambo) {
		t.Error("a bought Lambo should be allowed")
	}

	glow := free
	glow.Underglow = true
	if cosmeticsOwned(nil, glow) {
		t.Error("turning on unbought underglow should be refused")
	}
	if !cosmeticsOwned([]string{"underglow"}, glow) {
		t.Error("bought underglow should be allowed")
	}
}
