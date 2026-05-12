package model

type Tier struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Color string `json:"color"`
}

type Item struct {
	ID     string  `json:"id"`
	Image  string  `json:"image"`
	Label  string  `json:"label"`
	TierID *string `json:"tierId"`
}

type TierlistData struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Tiers       []Tier `json:"tiers"`
	Items       []Item `json:"items"`
}

func DefaultData() TierlistData {
	return TierlistData{
		Title:       "Games Tierlist",
		Description: "",
		Tiers: []Tier{
			{ID: "s", Label: "S", Color: "#ff7f7f"},
			{ID: "a", Label: "A", Color: "#ffbf7f"},
			{ID: "b", Label: "B", Color: "#ffff7f"},
			{ID: "c", Label: "C", Color: "#bfff7f"},
			{ID: "d", Label: "D", Color: "#7fbfff"},
		},
		Items: []Item{},
	}
}

func Normalize(data TierlistData) TierlistData {
	defaultData := DefaultData()

	if data.Title == "" {
		data.Title = defaultData.Title
	}

	if data.Tiers == nil {
		data.Tiers = defaultData.Tiers
	}

	if data.Items == nil {
		data.Items = []Item{}
	}

	return data
}
