# FactoryOps CMMS

Computerized Maintenance Management System (CMMS) for factory operations.

## Structure

```
backend/
  factoryops.API             ASP.NET Core Web API (entry point)
  factoryops.Application     Use cases and application services
  factoryops.Domain          Domain entities and business rules
  factoryops.Infrastructure  Persistence and external integrations
  factoryops.Tests           Tests
frontend/                         Frontend app (not yet started)
docs/                             Documentation
```

## Getting started

```sh
dotnet build backend/factoryops.slnx
dotnet run --project backend/factoryops.API
dotnet test backend/factoryops.slnx
```
