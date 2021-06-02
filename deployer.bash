#!/bin/bash

git pull origin main 
npm install
pm2 restart loader