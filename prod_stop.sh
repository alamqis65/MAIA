#!/bin/bash

echo "Stop MAIA Web-app Demo"
sudo systemctl stop maia-demo

echo "Stop MAIA-Gateway"
sudo systemctl stop maia-gateway

echo "Stop MAIA-Transcriber"
sudo systemctl stop maia-transcriber

echo "Stop MAIA-Composer"
sudo systemctl stop maia-composer

echo "Stop RabbitMQ service"
sudo systemctl stop rabbitmq-server

echo "Stop Ollama LLM"
sudo systemctl stop ollama

echo ""

