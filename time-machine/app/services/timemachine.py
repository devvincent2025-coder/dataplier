from app.models.snapshot import ReplayPlan, ReplayRequest, SnapshotRecord


SNAPSHOTS = [
    SnapshotRecord(
        snapshot_id="snap-001",
        dataset_name="customers.core",
        captured_at="2026-04-07T22:00:00Z",
        version_label="pre-fraud-refresh",
        storage_uri="s3://dataplier-snapshots/customers.core/snap-001",
    ),
    SnapshotRecord(
        snapshot_id="snap-002",
        dataset_name="retail.clickstream_events",
        captured_at="2026-04-07T20:30:00Z",
        version_label="pre-dedupe",
        storage_uri="abfss://snapshots@clickstream/pre-dedupe",
    ),
]


def list_snapshots() -> list[SnapshotRecord]:
    return SNAPSHOTS


def build_replay_plan(request: ReplayRequest) -> ReplayPlan:
    return ReplayPlan(
        dataset_name=request.dataset_name,
        as_of=request.as_of,
        target_environment=request.target_environment,
        strategy="snapshot-rehydrate-and-redirect",
        steps=[
            "Locate nearest immutable snapshot before requested point-in-time.",
            "Rehydrate dataset into isolated recovery namespace.",
            "Validate schema contract before reattaching downstream readers.",
            "Optionally replay historical pipeline with audited rollback marker.",
        ],
    )

