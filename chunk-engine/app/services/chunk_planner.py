import json
import os
from math import ceil

from kafka import KafkaProducer

from app.models.chunk import ChunkPlan, ChunkTask, DatasetProfile


def build_chunk_plan(profile: DatasetProfile) -> ChunkPlan:
    throughput_weight = max(profile.network_throughput_mb_s // 64, 1)
    rows_per_worker = max(profile.estimated_rows // max(profile.worker_capacity * throughput_weight, 1), 1)
    recommended_chunk_rows = min(max(rows_per_worker, 50_000), 5_000_000)
    chunk_count = ceil(profile.estimated_rows / recommended_chunk_rows)
    estimated_bytes_per_row = max(profile.estimated_bytes // profile.estimated_rows, 1)

    tasks = []
    for index in range(chunk_count):
        offset = index * recommended_chunk_rows
        limit = min(recommended_chunk_rows, profile.estimated_rows - offset)
        tasks.append(
            ChunkTask(
                job_id=profile.job_id,
                workspace_id=profile.workspace_id,
                pipeline_id=profile.pipeline_id,
                chunk_index=index,
                offset=offset,
                limit=limit,
                estimated_bytes=limit * estimated_bytes_per_row,
                source_partition=f"partition-{index % profile.partitions}",
            )
        )

    return ChunkPlan(
        dataset_name=profile.dataset_name,
        recommended_chunk_rows=recommended_chunk_rows,
        chunk_count=chunk_count,
        tasks=tasks,
    )


def dispatch_chunk_plan(plan: ChunkPlan) -> int:
    bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    topic = os.getenv("KAFKA_CHUNK_TASK_TOPIC", "chunk.tasks")

    producer = KafkaProducer(
        bootstrap_servers=bootstrap_servers,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
        acks="all",
        retries=5,
    )
    published = 0
    try:
        for task in plan.tasks:
            payload = {
                "job_id": task.job_id,
                "workspace_id": task.workspace_id,
                "pipeline_id": task.pipeline_id,
                "dataset_name": plan.dataset_name,
                "chunk_index": task.chunk_index,
                "offset": task.offset,
                "limit": task.limit,
                "estimated_bytes": task.estimated_bytes,
                "source_partition": task.source_partition,
            }
            producer.send(topic, payload)
            published += 1
        producer.flush()
    finally:
        producer.close()
    return published

