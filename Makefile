MAKEFLAGS=--no-builtin-rules --no-builtin-variables --always-make
ROOT := $(realpath $(dir $(lastword $(MAKEFILE_LIST))))
SHELL := /bin/bash

vendor:
	source venv/bin/activate && poetry install

update-modules:
	source venv/bin/activate && poetry update

types:
	source venv/bin/activate && mypy .

run-server:
	source venv/bin/activate && python -m server
