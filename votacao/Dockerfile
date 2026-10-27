FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Os segredos de verdade vêm do `fly secrets`; aqui só para juntar os arquivos estáticos.
RUN DJANGO_SECRET_KEY=build CODIGO_PEPPER=build python manage.py collectstatic --noinput

EXPOSE 8000
# 1 máquina e 1 volume: o banco SQLite fica em /dados.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi -b 0.0.0.0:8000 --workers 2 --threads 4 --timeout 30 --access-logfile -"]
