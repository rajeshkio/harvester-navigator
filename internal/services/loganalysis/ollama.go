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

type OllamaAnalyzer struct {
	baseURL string
	model   string
}

func NewOllamaAnalyzer(baseURL, model string) (*OllamaAnalyzer, error) {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	if model == "" {
		model = "mistral"
	}

	return &OllamaAnalyzer{
		baseURL: baseURL,
		model:   model,
	}, nil
}

type OllamaRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Stream  bool                   `json:"stream"`
	Options map[string]interface{} `json:"options,omitempty"`
}

type OllamaResponse struct {
	Model         string `json:"model"`
	Response      string `json:"response"`
	Done          bool   `json:"done"`
	Context       []int  `json:"context,omitempty"`
	TotalDuration int64  `jsosn:"total_duration,omitempty"`
	EvalCount     int    `json:"eval_count,omitempty"`
}

func (o *OllamaAnalyzer) Analyze(ctx context.Context, prompt string) (*types.LogAnalysisResult, error) {
	// Add JSON schema instruction to prompt
	fullPrompt := prompt + `

CRITICAL: Respond with ONLY this JSON structure:
{
  "root_cause": "Based on VOLUME STATUS: State=detached, Robustness=unknown, 3/3 replicas faulted indicates DiskPressure",
  "error_lines": [],
  "failing_component": "Longhorn replica scheduler",
  "recommended_action": "Check node disk capacity: kubectl get nodes -o wide",
  "confidence": "high"
}

RULES:
- Keep error_lines as empty array []
- Focus on volume status NOT logs
- No escape sequences in field names
- One sentence per field
- Complete the JSON fully`

	reqBody := OllamaRequest{
		Model:  o.model,
		Prompt: fullPrompt,
		Stream: false,
		Options: map[string]interface{}{
			"num_predict": 512, // Allow longer responses
			"temperature": 0.1, // Lower temperature for more consistent JSON
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", o.baseURL+"/api/generate", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama API call failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama API error: %s - %s", resp.Status, string(body))
	}

	var ollamaResp OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return nil, fmt.Errorf("failed to decode ollama response: %w", err)
	}

	// Debug: Log the raw response
	//	log.Printf("===== OLLAMA RAW RESPONSE =====")
	//	log.Printf("%s", ollamaResp.Response)
	//	log.Printf("===== END OLLAMA RESPONSE =====")

	// Extract JSON from response (might be wrapped in markdown or have text around it)
	responseText := ollamaResp.Response

	// Try to find JSON in markdown code blocks first
	jsonStart := strings.Index(responseText, "```json")
	jsonEnd := strings.LastIndex(responseText, "```")

	if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
		// Extract JSON from markdown block
		responseText = responseText[jsonStart+7 : jsonEnd]
	} else {
		// Try to find raw JSON object
		jsonStart = strings.Index(responseText, "{")
		jsonEnd = strings.LastIndex(responseText, "}")

		if jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart {
			responseText = responseText[jsonStart : jsonEnd+1]
		}
	}

	responseText = strings.TrimSpace(responseText)

	// Sanitize JSON: remove ALL backslash-underscore and similar invalid escapes
	// These commonly appear when LLMs try to escape underscores incorrectly
	responseText = strings.ReplaceAll(responseText, `\_`, "_")
	responseText = strings.ReplaceAll(responseText, `\-`, "-")
	responseText = strings.ReplaceAll(responseText, `\.`, ".")

	// Also fix if they appear in the raw response before extraction
	responseText = strings.ReplaceAll(responseText, `root\_cause`, `root_cause`)
	responseText = strings.ReplaceAll(responseText, `error\_lines`, `error_lines`)
	responseText = strings.ReplaceAll(responseText, `failing\_component`, `failing_component`)
	responseText = strings.ReplaceAll(responseText, `recommended\_action`, `recommended_action`)

	log.Printf("===== SANITIZED JSON =====")
	log.Printf("%s", responseText)
	log.Printf("===== END SANITIZED =====")

	// Parse the extracted JSON
	var result types.LogAnalysisResult
	if err := json.Unmarshal([]byte(responseText), &result); err != nil {
		log.Printf("Failed to parse JSON from Ollama response. Response was: %s", responseText)
		log.Printf("Parse error: %v", err)
		return nil, fmt.Errorf("failed to parse analysis result: %w", err)
	}

	// Add metadata
	result.Provider = "ollama-" + o.model
	result.TokensUsed = ollamaResp.EvalCount
	result.EstimatedCost = 0.0 // Local, no cost

	return &result, nil
}

// Name returns the provider name
func (o *OllamaAnalyzer) Name() string {
	return "ollama"
}

// EstimatedCost returns cost estimate (always 0 for local)
func (o *OllamaAnalyzer) EstimatedCost() float64 {
	return 0.0
}
