package loganalysis

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/generative-ai-go/genai"
	types "github.com/rk280392/harvesterNavigator/internal/models"
	"google.golang.org/api/option"
)

type GeminiAnalyzer struct {
	client *genai.Client
	model  *genai.GenerativeModel
}

func NewGeminiAnalyzer(ctx context.Context, apiKey string) (*GeminiAnalyzer, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("gemini API key is required")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create gemini client: %w", err)
	}

	model := client.GenerativeModel("gemini-2.5-flash")
	model.ResponseMIMEType = "application/json"

	return &GeminiAnalyzer{
		client: client,
		model:  model,
	}, nil
}

func (g *GeminiAnalyzer) Analyze(ctx context.Context, prompt string) (*types.LogAnalysisResult, error) {

	fullPrompt := prompt + `
Return JSON with these exact fields:
{
  "root_cause": "brief explanation",
  "error_lines": ["error line 1", "error line 2"],
  "failing_component": "component name",
  "recommended_action": "what to do",
  "confidence": "high/medium/low"
}`
	resp, err := g.model.GenerateContent(ctx, genai.Text(fullPrompt))
	if err != nil {
		return nil, fmt.Errorf("gemini API call failed: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no response from Gemini")
	}

	textPart, ok := resp.Candidates[0].Content.Parts[0].(genai.Text)
	if !ok {
		return nil, fmt.Errorf("unexpected response format from Gemini")
	}

	var result types.LogAnalysisResult
	if err := json.Unmarshal([]byte(textPart), &result); err != nil {
		return nil, fmt.Errorf("failed to parse Gemini response: %w", err)
	}

	result.Provider = "gemini"
	if resp.UsageMetadata != nil {
		result.TokensUsed = int(resp.UsageMetadata.TotalTokenCount)

		inputCost := float64(resp.UsageMetadata.PromptTokenCount) * 0.075 / 1000000
		outputCost := float64(resp.UsageMetadata.CandidatesTokenCount) * 0.30 / 1000000

		result.EstimatedCost = inputCost + outputCost
	}
	return &result, nil
}

func (g *GeminiAnalyzer) Name() string {
	return "gemini"
}

func (g *GeminiAnalyzer) Close() error {
	if g.client != nil {
		return g.client.Close()
	}
	return nil
}

func (g *GeminiAnalyzer) EstimatedCost() float64 {
	// Average of input ($0.075) and output ($0.30) per 1M tokens
	return 0.0002 // Approximately $0.0002 per 1000 tokens
}
