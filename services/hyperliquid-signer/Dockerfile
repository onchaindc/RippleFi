FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY signer ./signer

RUN useradd --create-home --uid 10001 signer \
    && mkdir -p /app/data \
    && chown -R signer:signer /app

USER signer

EXPOSE 8787

CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8787} --no-access-log"]
