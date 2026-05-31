.PHONY: install build test typecheck bundle-sizes lint check

install:
	npm ci

build:
	npm run build

test:
	npm test

typecheck:
	npm run typecheck

bundle-sizes:
	npm run bundle-sizes

lint:
	npx prettier packages/ projects/ --check
	npx eslint .
	npx lerna run lint

format:
	npx prettier packages/ projects/ --write
	npx eslint . --fix

check:
	make build
	make test
	make lint
	make typecheck
