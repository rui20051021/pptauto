from __future__ import annotations

import mimetypes
import shutil
from dataclasses import dataclass
from pathlib import Path

from boto3 import client as boto3_client

from ..core.config import settings


@dataclass
class StoredObject:
    key: str
    size_bytes: int
    content_type: str


class StorageBackend:
    def put_file(self, source: Path, key: str, content_type: str | None = None) -> StoredObject:
        raise NotImplementedError

    def put_bytes(self, content: bytes, key: str, content_type: str) -> StoredObject:
        raise NotImplementedError

    def read_bytes(self, key: str) -> bytes:
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _abs(self, key: str) -> Path:
        return self.root / key

    def put_file(self, source: Path, key: str, content_type: str | None = None) -> StoredObject:
        target = self._abs(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        mime = content_type or mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        return StoredObject(key=key, size_bytes=target.stat().st_size, content_type=mime)

    def put_bytes(self, content: bytes, key: str, content_type: str) -> StoredObject:
        target = self._abs(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return StoredObject(key=key, size_bytes=len(content), content_type=content_type)

    def read_bytes(self, key: str) -> bytes:
        return self._abs(key).read_bytes()


class S3StorageBackend(StorageBackend):
    def __init__(self) -> None:
        if not settings.s3_bucket:
            raise RuntimeError("当存储后端使用 S3 时，必须配置 PPT_UI_S3_BUCKET")
        self.bucket = settings.s3_bucket
        self.client = boto3_client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )

    def put_file(self, source: Path, key: str, content_type: str | None = None) -> StoredObject:
        mime = content_type or mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        self.client.upload_file(str(source), self.bucket, key, ExtraArgs={"ContentType": mime})
        return StoredObject(key=key, size_bytes=source.stat().st_size, content_type=mime)

    def put_bytes(self, content: bytes, key: str, content_type: str) -> StoredObject:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType=content_type)
        return StoredObject(key=key, size_bytes=len(content), content_type=content_type)

    def read_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()


def get_storage() -> StorageBackend:
    if settings.storage_backend == "s3":
        return S3StorageBackend()
    return LocalStorageBackend(settings.local_storage_root)
