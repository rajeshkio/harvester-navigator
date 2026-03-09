// Package patternengine provides offline pattern-based log analysis for Harvester clusters.
// Ported from r8s (github.com/Rancheroo/r8s) and extended with Harvester-specific patterns.
package patternengine

import "time"

// Severity represents issue severity
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

// Confidence represents detection confidence levels
type Confidence string

const (
	ConfidenceCertain  Confidence = "certain"
	ConfidenceLikely   Confidence = "likely"
	ConfidencePossible Confidence = "possible"
)

// PatternV2 represents a detection pattern with confidence and correlation support
type PatternV2 struct {
	ID            string        `yaml:"id"`
	Name          string        `yaml:"name"`
	Category      string        `yaml:"category"`
	Severity      Severity      `yaml:"severity"`
	Confidence    Confidence    `yaml:"confidence"`
	Matchers      []Matcher     `yaml:"matchers"`
	Correlations  []Correlation `yaml:"correlations"`
	HintGenerator HintGenerator `yaml:"hint_generator"`
	Description   string        `yaml:"description"`
}

// Matcher defines how to match a pattern
type Matcher struct {
	Type    string  `yaml:"type"`
	Pattern string  `yaml:"pattern"`
	Weight  float64 `yaml:"weight"`
}

// Correlation links patterns together for root cause analysis
type Correlation struct {
	PatternID string `yaml:"pattern_id"`
	Message   string `yaml:"message"`
}

// HintGenerator produces root cause hints from pattern matches
type HintGenerator struct {
	Template   string   `yaml:"template"`
	Variables  []string `yaml:"variables"`
	Suggestion string   `yaml:"suggestion"`
	Command    string   `yaml:"command"`
	References []string `yaml:"references"`
}

// MatchResultV2 represents pattern matching outcome with correlation support
type MatchResultV2 struct {
	Matched         bool
	PatternID       string
	PatternName     string
	Severity        Severity
	Confidence      Confidence
	Message         string
	Resources       []Resource
	Evidence        []string
	Correlated      []string
	Metadata        map[string]string
	OccurrenceCount int // how many times the primary keyword appeared in the logs
}

// Resource identifies a Kubernetes resource affected by a pattern
type Resource struct {
	Kind      string
	Name      string
	Namespace string
}

// AnalysisOptions provides filtering options for analysis
type AnalysisOptions struct {
	MinSeverity   Severity
	MinConfidence Confidence
	MaxHints      int
	IncludeInfo   bool
}

// AnalysisResult represents the complete analysis of log content
type AnalysisResult struct {
	StartTime    time.Time
	EndTime      time.Time
	Duration     time.Duration
	Patterns     []MatchResultV2
	Hints        []*Hint
	Correlations []CorrelationMatch
	Summary      AnalysisSummary
}

// CorrelationMatch represents a detected correlation between patterns
type CorrelationMatch struct {
	PatternID1 string
	PatternID2 string
	Message    string
}

// AnalysisSummary provides high-level statistics
type AnalysisSummary struct {
	TotalPatterns  int
	MatchesFound   int
	CriticalIssues int
	WarningIssues  int
	InfoIssues     int
	Correlations   int
}

// Hint represents a generated root cause hint
type Hint struct {
	PatternID       string
	Severity        Severity
	Confidence      Confidence
	Summary         string
	Explanation     string
	Suggestion      string
	Command         string
	References      []string
	Metadata        map[string]string
	OccurrenceCount int
}
