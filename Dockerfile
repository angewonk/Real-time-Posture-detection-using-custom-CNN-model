# Use the official Python 3.10 image
FROM python:3.10

# Set working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your code
COPY . .

# Expose the port Railway expects
EXPOSE 5000

# Run your Flask app
CMD ["python3", "app.py"]