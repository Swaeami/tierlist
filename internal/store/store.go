package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"games-tierlist/internal/model"
)

type Store struct {
	mu        sync.Mutex
	dataDir   string
	dataPath  string
	coversDir string
}

func New(dataDir string) (*Store, error) {
	if dataDir == "" {
		dataDir = "./runtime"
	}

	store := &Store{
		dataDir:   dataDir,
		dataPath:  filepath.Join(dataDir, "data", "games.json"),
		coversDir: filepath.Join(dataDir, "covers"),
	}

	if err := store.Ensure(); err != nil {
		return nil, err
	}

	return store, nil
}

func (store *Store) Ensure() error {
	if err := os.MkdirAll(filepath.Dir(store.dataPath), 0755); err != nil {
		return err
	}

	if err := os.MkdirAll(store.coversDir, 0755); err != nil {
		return err
	}

	if _, err := os.Stat(store.dataPath); os.IsNotExist(err) {
		return store.Write(model.DefaultData())
	}

	return nil
}

func (store *Store) CoversDir() string {
	return store.coversDir
}

func (store *Store) Read() (model.TierlistData, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	file, err := os.Open(store.dataPath)
	if err != nil {
		return model.DefaultData(), err
	}
	defer file.Close()

	var data model.TierlistData

	if err := json.NewDecoder(file).Decode(&data); err != nil {
		return model.DefaultData(), err
	}

	return model.Normalize(data), nil
}

func (store *Store) Write(data model.TierlistData) error {
	store.mu.Lock()
	defer store.mu.Unlock()

	data = model.Normalize(data)

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	bytes = append(bytes, '\n')

	tmpPath := store.dataPath + ".tmp"

	if err := os.WriteFile(tmpPath, bytes, 0644); err != nil {
		return err
	}

	return os.Rename(tmpPath, store.dataPath)
}

func (store *Store) SaveUpload(header *multipart.FileHeader, label string) (model.Item, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	src, err := header.Open()
	if err != nil {
		return model.Item{}, err
	}
	defer src.Close()

	base := slugify(label)

	if base == "" {
		base = slugify(strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)))
	}

	if base == "" {
		base = "cover"
	}

	filename := fmt.Sprintf("%s-%s.webp", base, randomHex(4))
	targetPath := filepath.Join(store.coversDir, filename)

	dst, err := os.Create(targetPath)
	if err != nil {
		return model.Item{}, err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return model.Item{}, err
	}

	return model.Item{
		ID:     randomUUIDLike(),
		Image:  "./covers/" + filename,
		Label:  label,
		TierID: nil,
	}, nil
}

func randomHex(bytesCount int) string {
	bytes := make([]byte, bytesCount)

	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}

	return hex.EncodeToString(bytes)
}

func randomUUIDLike() string {
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		randomHex(4),
		randomHex(2),
		randomHex(2),
		randomHex(2),
		randomHex(6),
	)
}

func slugify(input string) string {
	value := strings.ToLower(strings.TrimSpace(input))

	reQuotes := regexp.MustCompile(`['"]`)
	value = reQuotes.ReplaceAllString(value, "")

	reSeparators := regexp.MustCompile(`[^a-z0-9а-яё]+`)
	value = reSeparators.ReplaceAllString(value, "-")

	value = strings.Trim(value, "-")

	return value
}
