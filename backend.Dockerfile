FROM python:3.10-slim

WORKDIR /app

# Copy requirements first (better caching)
COPY backend/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

EXPOSE 5000

CMD ["python", "app.py"]