package loganalysis

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

type OpenWebUIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
type OpenWebUIFile struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type OpenWebUIRequest struct {
	Model    string             `json:"model"`
	Messages []OpenWebUIMessage `json:"messages"`
	Files    []OpenWebUIFile    `json:"files,omitempty"`
}

type OpenWebUIResponseMessage struct {
	Content          string `json:"content"`
	ReasoningContent string `json:"reasoning_content"`
}

type OpenWebUIChoice struct {
	Message OpenWebUIResponseMessage `json:"message"`
}

type OpenWebUIUsage struct {
	CompletionTokens int `json:"completion_tokens"`
	PromptTokens     int `json:"prompt_tokens"`
}

type OpenWebUIResponse struct {
	Choices []OpenWebUIChoice `json:"choices"`
	Usage   OpenWebUIUsage    `json:"usage"`
}

type OpenWebUIAnalyzer struct {
	baseURL      string
	model        string
	apiKey       string
	collectionID string
	client       *http.Client
}

func NewOpenwebuiAnalyzer(baseURL, model, apiKey, collectionID string) (*OpenWebUIAnalyzer, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("baseURL is required for OpenWebUI analyzer")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("apiKey is required for OpenWebUI analyzer")
	}

	if model == "" {
		model = "qwen3:latest"
	}

	return &OpenWebUIAnalyzer{
		baseURL:      baseURL,
		model:        model,
		apiKey:       apiKey,
		collectionID: collectionID,
		client:       &http.Client{},
	}, nil
}

func (o *OpenWebUIAnalyzer) Analyze(ctx context.Context, prompt string) (*types.LogAnalysisResult, error) {
	reqBody := OpenWebUIRequest{
		Model: o.model,
		Messages: []OpenWebUIMessage{
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}
	if o.collectionID != "" {
		reqBody.Files = []OpenWebUIFile{
			{Type: "collection", ID: o.collectionID},
		}
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/api/chat/completions", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.apiKey)

	resp, err := o.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OpenWebUI API call failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenWebUI API error: %s - %s", resp.Status, string(body))
	}
	var owuResp OpenWebUIResponse
	if err := json.NewDecoder(resp.Body).Decode(&owuResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}
	if len(owuResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}
	responseText := owuResp.Choices[0].Message.Content

	// Strip markdown code blocks if present
	jsonStart := strings.Index(responseText, "```json")
	jsonEnd := strings.LastIndex(responseText, "```")

	if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
		responseText = responseText[jsonStart+7 : jsonEnd]
	} else {
		jsonStart = strings.Index(responseText, "{")
		jsonEnd = strings.LastIndex(responseText, "}")
		if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
			responseText = responseText[jsonStart : jsonEnd+1]
		}
	}

	responseText = strings.TrimSpace(responseText)
	log.Printf("===== OPENWEBUI RAW RESPONSE =====")
	log.Printf("%s", responseText)
	log.Printf("===== END RESPONSE =====")

	var result types.LogAnalysisResult
	if err := json.Unmarshal([]byte(responseText), &result); err != nil {
		return nil, fmt.Errorf("failed to parse analysis result: %w", err)
	}

	result.Provider = "openwebui-" + o.model
	result.TokensUsed = owuResp.Usage.CompletionTokens
	result.EstimatedCost = 0.0

	return &result, nil
}

func (o *OpenWebUIAnalyzer) Name() string {
	return "openwebui"
}

func (o *OpenWebUIAnalyzer) EstimatedCost() float64 {
	return 0.0
}
