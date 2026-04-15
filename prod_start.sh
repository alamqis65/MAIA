#!/bin/bash

echo "Start Ollama LLM"
sudo systemctl start ollama

echo "Start RabbitMQ service"
sudo systemctl start rabbitmq-server

echo "Start MAIA-Composer"
sudo systemctl start maia-composer

echo "Start MAIA-Transcriber"
sudo systemctl start maia-transcriber

echo "Start MAIA-Gateway"
sudo systemctl start maia-gateway

echo "Start MAIA Web-app Demo"
sudo systemctl start maia-demo

echo ""
echo "Demo URL: http://192.168.90.98:3000"
echo ""

