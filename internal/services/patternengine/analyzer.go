package patternengine

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"time"

	types "github.com/rk280392/harvesterNavigator/internal/models"
)

// Analyzer is the main entry point for pattern-based log analysis
type Analyzer struct {
	registry  *PatternRegistry
	hints     *HintGeneratorV2
	workers   int
}

// NewAnalyzer creates an Analyzer with all built-in patterns loaded
func NewAnalyzer() *Analyzer {
	workers := runtime.NumCPU()
	if workers < 4 {
		workers = 4
	}
	return &Analyzer{
		registry: NewRegistry(),
		hints:    newHintGenerator(),
		workers:  workers,
	}
}

// AnalyzeLogs runs the pattern engine against raw log text and returns a LogAnalysisResult.
// This is designed to be called before any LLM provider — if confidence is high, the LLM call can be skipped.
func (a *Analyzer) AnalyzeLogs(ctx context.Context, logContent string) (*types.LogAnalysisResult, error) {
	if strings.TrimSpace(logContent) == "" {
		return nil, fmt.Errorf("no log content provided")
	}

	start := time.Now()

	matches := a.analyzeParallel(ctx, logContent)
	hints := a.hints.GenerateAll(matches, a.registry)
	correlations := DetectCorrelations(matches, a.registry)

	if len(hints) == 0 {
		return nil, nil // no patterns matched — caller should fall through to LLM
	}

	// Sort hints: critical first
	hints = sortHints(hints)

	// Pick the top (most severe, most confident) hint as root cause
	top := hints[0]

	result := &types.LogAnalysisResult{
		Provider:          "pattern-engine",
		RootCause:         top.Summary,
		FailingComponent:  categoryFromPatternID(top.PatternID, a.registry),
		RecommendedAction: top.Suggestion,
		Confidence:        mapConfidence(top.Confidence),
		ErrorLines:        collectEvidence(matches, 10),
		EstimatedCost:     0,
		TokensUsed:        0,
	}

	// Enrich with correlation context if present
	if len(correlations) > 0 {
		msgs := make([]string, 0, len(correlations))
		for _, c := range correlations {
			msgs = append(msgs, c.Message)
		}
		result.RootCause += " [correlated: " + strings.Join(msgs, "; ") + "]"
	}

	_ = start
	return result, nil
}

// analyzeParallel runs all patterns concurrently against the log content
func (a *Analyzer) analyzeParallel(ctx context.Context, content string) []MatchResultV2 {
	patterns := a.registry.GetAll()
	type result struct{ matches []MatchResultV2 }

	tasks := make(chan PatternV2, len(patterns))
	results := make(chan result, len(patterns))

	var wg sync.WaitGroup
	for i := 0; i < a.workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range tasks {
				select {
				case <-ctx.Done():
					return
				default:
					m := NewMatcherV2(p)
					results <- result{matches: m.Match(content)}
				}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	for _, p := range patterns {
		tasks <- p
	}
	close(tasks)

	var all []MatchResultV2
	matchedIDs := make(map[string]bool)
	for r := range results {
		for _, match := range r.matches {
			if match.Matched {
				all = append(all, match)
				matchedIDs[match.PatternID] = true
			}
		}
	}

	// Fill in correlations
	for i := range all {
		p, found := a.registry.GetByID(all[i].PatternID)
		if !found {
			continue
		}
		for _, corr := range p.Correlations {
			if matchedIDs[corr.PatternID] {
				all[i].Correlated = append(all[i].Correlated, corr.PatternID)
			}
		}
	}
	return all
}

// sortHints: severity is primary key, then confidence, then occurrence frequency.
// Within the same severity+confidence bucket, the most frequent signal wins.
func sortHints(hints []*Hint) []*Hint {
	out := make([]*Hint, len(hints))
	copy(out, hints)
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if hintLess(out[j], out[i]) {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func hintLess(a, b *Hint) bool {
	sa, sb := severityRank(a.Severity), severityRank(b.Severity)
	if sa != sb {
		return sa < sb
	}
	ca, cb := confidenceRank(a.Confidence), confidenceRank(b.Confidence)
	if ca != cb {
		return ca < cb
	}
	// Same severity and confidence — higher occurrence count wins
	return a.OccurrenceCount < b.OccurrenceCount
}

func severityRank(s Severity) int {
	switch s {
	case SeverityCritical:
		return 3
	case SeverityWarning:
		return 2
	default:
		return 1
	}
}

func confidenceRank(c Confidence) int {
	switch c {
	case ConfidenceCertain:
		return 3
	case ConfidenceLikely:
		return 2
	default:
		return 1
	}
}

func categoryFromPatternID(id string, reg *PatternRegistry) string {
	p, found := reg.GetByID(id)
	if !found {
		return "unknown"
	}
	return p.Category
}

func mapConfidence(c Confidence) string {
	switch c {
	case ConfidenceCertain:
		return "high"
	case ConfidenceLikely:
		return "medium"
	default:
		return "low"
	}
}

func collectEvidence(matches []MatchResultV2, max int) []string {
	seen := make(map[string]bool)
	var out []string
	for _, m := range matches {
		for _, e := range m.Evidence {
			if e != "" && !seen[e] {
				seen[e] = true
				out = append(out, e)
				if len(out) >= max {
					return out
				}
			}
		}
	}
	return out
}
