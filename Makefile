.PHONY: install build test test-package-exports test-packages test-browser typecheck bundle-sizes lint check

install:
	npm ci

build:
	npm run build

test:
	npm test

test-package-exports:
	npm run test:package-exports

test-packages:
	npm run test:packages

test-browser:
	npm run test:browser

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
	make test-package-exports
	make test-packages
	make test-browser
	make lint
	make typecheck
