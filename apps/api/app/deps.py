from __future__ import annotations

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .security import decode_token


bearer_scheme = HTTPBearer(auto_error=False)


def _resolve_user_from_token(token: str | None, db: Session) -> models.User:
    user_id = decode_token(token or "")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录凭证无效，请重新登录")

    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="当前用户不存在，请重新登录")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要先登录后才能访问")
    return _resolve_user_from_token(credentials.credentials, db)


def get_current_user_for_artifact(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    access_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is not None and credentials.scheme.lower() == "bearer":
        return _resolve_user_from_token(credentials.credentials, db)
    if access_token:
        return _resolve_user_from_token(access_token, db)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要先登录后才能访问")
