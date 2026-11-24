package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/IBM/sarama"
)

type ChunkTask struct {
	JobID           string `json:"job_id"`
	WorkspaceID     string `json:"workspace_id"`
	PipelineID      string `json:"pipeline_id"`
	DatasetName     string `json:"dataset_name"`
	ChunkIndex      int    `json:"chunk_index"`
	Offset          int64  `json:"offset"`
	Limit           int64  `json:"limit"`
	EstimatedBytes  int64  `json:"estimated_bytes"`
	SourcePartition string `json:"source_partition"`
}

func main() {
	log.Println("transfer-worker booting")
	brokers := strings.Split(getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092"), ",")
	topic := getenv("KAFKA_CHUNK_TASK_TOPIC", "chunk.tasks")
	groupID := getenv("KAFKA_GROUP_ID", "transfer-worker-group")

	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_8_0_0
	cfg.Consumer.Return.Errors = true
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest

	group, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		log.Fatalf("failed to create kafka consumer group: %v", err)
	}
	defer group.Close()

	handler := &consumerHandler{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-signals
		cancel()
	}()

	for {
		if ctx.Err() != nil {
			log.Println("transfer-worker shutting down")
			return
		}
		if err := group.Consume(ctx, []string{topic}, handler); err != nil {
			log.Printf("kafka consume error: %v", err)
			time.Sleep(2 * time.Second)
		}
	}
}

type consumerHandler struct{}

func (h *consumerHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }
func (h *consumerHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for message := range claim.Messages() {
		var task ChunkTask
		if err := json.Unmarshal(message.Value, &task); err != nil {
			log.Printf("invalid chunk task payload: %v", err)
			session.MarkMessage(message, "invalid")
			continue
		}
		processTask(task)
		session.MarkMessage(message, "processed")
	}
	return nil
}

func processTask(task ChunkTask) {
	maxAttempts := getenvInt("CHUNK_MAX_ATTEMPTS", 3)
	failPct := getenvInt("CHUNK_SIMULATE_FAILURE_PCT", 0)
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	reportChunkEvent(task, "started")
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		log.Printf(
			"processing dataset=%s chunk=%d attempt=%d/%d partition=%s offset=%d limit=%d bytes=%d",
			task.DatasetName,
			task.ChunkIndex,
			attempt,
			maxAttempts,
			task.SourcePartition,
			task.Offset,
			task.Limit,
			task.EstimatedBytes,
		)
		time.Sleep(300 * time.Millisecond)
		if failPct > 0 && rand.Intn(100) < failPct {
			log.Printf("simulated failure dataset=%s chunk=%d attempt=%d", task.DatasetName, task.ChunkIndex, attempt)
			if attempt < maxAttempts {
				reportChunkEvent(task, "retrying")
				time.Sleep(backoffDuration(attempt))
				continue
			}
			reportChunkEvent(task, "failed")
			return
		}
		log.Printf("completed dataset=%s chunk=%d", task.DatasetName, task.ChunkIndex)
		reportChunkEvent(task, "completed")
		return
	}
}

func backoffDuration(attempt int) time.Duration {
	base := 200 * time.Millisecond
	d := base * time.Duration(1<<uint(min(attempt-1, 6)))
	if d > 10*time.Second {
		return 10 * time.Second
	}
	return d
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func getenvInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getenv(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

var jobEventsClient = &http.Client{Timeout: 15 * time.Second}

func reportChunkEvent(task ChunkTask, state string) {
	if task.JobID == "" {
		return
	}
	jobServiceURL := getenv("JOB_SERVICE_URL", "http://job-service:8085")
	payload := map[string]any{
		"job_id":           task.JobID,
		"workspace_id":     task.WorkspaceID,
		"pipeline_id":      task.PipelineID,
		"dataset_name":     task.DatasetName,
		"source_partition": task.SourcePartition,
		"chunk_index":      task.ChunkIndex,
		"state":            state,
		"bytes":            task.EstimatedBytes,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("chunk event marshal job=%s chunk=%d: %v", task.JobID, task.ChunkIndex, err)
		return
	}
	url := strings.TrimRight(jobServiceURL, "/") + "/jobs/events"
	maxPost := getenvInt("JOB_EVENT_POST_MAX_ATTEMPTS", 4)
	if maxPost < 1 {
		maxPost = 1
	}
	for attempt := 1; attempt <= maxPost; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			cancel()
			log.Printf("chunk event request job=%s chunk=%d: %v", task.JobID, task.ChunkIndex, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := jobEventsClient.Do(req)
		cancel()
		if err != nil {
			if attempt < maxPost {
				time.Sleep(jobEventPostBackoff(attempt))
				continue
			}
			log.Printf("failed to report chunk event job=%s chunk=%d state=%s: %v", task.JobID, task.ChunkIndex, state, err)
			return
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			if attempt < maxPost {
				time.Sleep(jobEventPostBackoff(attempt))
				continue
			}
		}
		if resp.StatusCode >= 400 {
			log.Printf("chunk event rejected job=%s chunk=%d state=%s status=%d", task.JobID, task.ChunkIndex, state, resp.StatusCode)
		}
		return
	}
}

func jobEventPostBackoff(attempt int) time.Duration {
	d := 150 * time.Millisecond * time.Duration(1<<uint(min(attempt-1, 5)))
	if d > 5*time.Second {
		return 5 * time.Second
	}
	return d
}
