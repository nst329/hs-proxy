#!/bin/sh
AB=`readlink -f $0`
DIR=`dirname $AB`
cd $DIR
nodejs hs-proxy.js 8988 http://localhost:8998/ > proxy.log 2>&1
