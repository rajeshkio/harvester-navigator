package loganalysis

import (
	"context"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

// LogAnalyzer is the interface that all LLM providers must implement
type LogAnalyzer interface {
	// Analyze takes a prompt and returns structured analysis
	Analyze(ctx context.Context, prompt string) (*types.LogAnalysisResult, error)

	// Name returns the provider name ("gemini" or "claude")
	Name() string

	// EstimatedCost returns cost estimate per 1000 tokens
	EstimatedCost() float64
}
