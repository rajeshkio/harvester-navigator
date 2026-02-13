package loganalysis

import (
	"context"
	"time"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

// StubAnalyzer is a fake implementation for testing

type StubAnalyzer struct{}

// NewStubAnalyzer creates a new stub analyzer
func NewStubAnalyzer() *StubAnalyzer {
	return &StubAnalyzer{}
}

func (s *StubAnalyzer) Analyze(ctx context.Context, prompt string) (*types.LogAnalysisResult, error) {
	// Simulate some processing time
	time.Sleep(500 * time.Millisecond)

	return &types.LogAnalysisResult{
		RootCause:         "Stub analysis: This is fake data for testing",
		ErrorLines:        []string{"Error line 1 from stub", "Error line 2 from stub"},
		FailingComponent:  "stub-component",
		RecommendedAction: "This is a stub - real analysis coming soon",
		Confidence:        "high",
		Provider:          "stub",
		TokensUsed:        1000,
		EstimatedCost:     0.0,
	}, nil
}

func (s *StubAnalyzer) Name() string {
	return "stub"
}

func (s *StubAnalyzer) EstimatedCost() float64 {
	return 0.0
}
