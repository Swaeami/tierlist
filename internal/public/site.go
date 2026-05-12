package public

import (
	"embed"
	"html/template"
	"net/http"
	"strconv"
	"strings"

	"games-tierlist/internal/model"
	"games-tierlist/internal/store"
)

//go:embed templates/site.html static/site.css
var embeddedFiles embed.FS

type Handler struct {
	store    *store.Store
	template *template.Template
}

type PageData struct {
	Title       string
	Description string
	Tiers       []TierView
}

type TierView struct {
	ID        string
	Label     string
	Color     string
	GridStyle string
	FontSize  int
	Items     []ItemView
}

type ItemView struct {
	ImageURL string
	Label    string
}

func NewHandler(store *store.Store) (*Handler, error) {
	tpl, err := template.ParseFS(embeddedFiles, "templates/site.html")
	if err != nil {
		return nil, err
	}

	return &Handler{
		store:    store,
		template: tpl,
	}, nil
}

func (handler *Handler) ServeCSS(w http.ResponseWriter, r *http.Request) {
	bytes, err := embeddedFiles.ReadFile("static/site.css")
	if err != nil {
		http.Error(w, "css not found", http.StatusInternalServerError)
		return
	}

	w.Header().Set("content-type", "text/css; charset=utf-8")
	_, _ = w.Write(bytes)
}

func (handler *Handler) ServeHome(w http.ResponseWriter, r *http.Request) {
	data, err := handler.store.Read()
	if err != nil {
		http.Error(w, "cannot read tierlist", http.StatusInternalServerError)
		return
	}

	page := buildPageData(data)

	w.Header().Set("content-type", "text/html; charset=utf-8")

	if err := handler.template.ExecuteTemplate(w, "site.html", page); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
		return
	}
}

func buildPageData(data model.TierlistData) PageData {
	sharedWidth, sharedFontSize := sharedTierLayout(data.Tiers)

	page := PageData{
		Title:       data.Title,
		Description: data.Description,
		Tiers:       []TierView{},
	}

	for _, tier := range data.Tiers {
		ownFont := tierFontSize(tier.Label)
		fontSize := minInt(ownFont, sharedFontSize)

		view := TierView{
			ID:        tier.ID,
			Label:     tier.Label,
			Color:     tier.Color,
			GridStyle: "grid-template-columns: " + strconv.Itoa(sharedWidth) + "px 1fr",
			FontSize:  fontSize,
			Items:     []ItemView{},
		}

		for _, item := range data.Items {
			if item.TierID != nil && *item.TierID == tier.ID {
				view.Items = append(view.Items, ItemView{
					ImageURL: publicImagePath(item.Image),
					Label:    item.Label,
				})
			}
		}

		page.Tiers = append(page.Tiers, view)
	}

	return page
}

func publicImagePath(image string) string {
	value := strings.TrimSpace(image)
	value = strings.TrimPrefix(value, ".")

	if !strings.HasPrefix(value, "/") {
		value = "/" + value
	}

	return value
}

func sharedTierLayout(tiers []model.Tier) (int, int) {
	width := 115
	fontSize := 32

	for _, tier := range tiers {
		width = maxInt(width, tierWidth(tier.Label))
		fontSize = minInt(fontSize, tierFontSize(tier.Label))
	}

	return width, fontSize
}

func tierWidth(text string) int {
	totalLength := runeLen(text)
	longest := longestWordLen(text)

	return minInt(310, maxInt(115, maxInt(80+longest*12, 60+totalLength*5)))
}

func tierFontSize(text string) int {
	totalLength := runeLen(text)

	return maxInt(14, minInt(32, 32-maxInt(0, totalLength-14)*6/10))
}

func longestWordLen(text string) int {
	words := strings.Fields(text)

	longest := 0
	for _, word := range words {
		longest = maxInt(longest, runeLen(word))
	}

	return longest
}

func runeLen(text string) int {
	return len([]rune(text))
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
