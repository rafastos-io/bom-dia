# Bom Dia - imagem de producao (VPS/Coolify).
# Backend usa SO a biblioteca padrao do Python: nenhuma dependencia extra.
FROM python:3.12-slim

# Nao gerar .pyc e log sem buffer (aparece no Coolify em tempo real).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=9463 \
    DATA_DIR=/data

WORKDIR /app

# curl: usado pelo healthcheck (do container e do Coolify). Nao e dependencia
# do app - o backend continua so com a biblioteca padrao do Python.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Codigo da aplicacao. O .dockerignore mantem fora do build o banco, config,
# scripts de Windows (.vbs/.bat/.pyw), .git e afins.
COPY bomdia.py index.html styles.css app.js ./
COPY assets/ ./assets/

# Pasta de dados (o volume persistente do Coolify sera montado aqui).
RUN mkdir -p /data \
 && adduser --disabled-password --gecos "" --uid 10001 appuser \
 && chown -R appuser:appuser /app /data
USER appuser

VOLUME ["/data"]
EXPOSE 9463

# Healthcheck interno do container (o Coolify tambem pode usar /health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:9463/health || exit 1

CMD ["python", "bomdia.py"]
