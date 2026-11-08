# FactoryOps CMMS

Computerized Maintenance Management System (CMMS) for factory operations.

## Structure

```
backend/
  factoryops-cmms.API             ASP.NET Core Web API (entry point)
  factoryops-cmms.Application     Use cases and application services
  factoryops-cmms.Domain          Domain entities and business rules
  factoryops-cmms.Infrastructure  Persistence and external integrations
  factoryops-cmms.Tests           Tests
frontend/                         Frontend app (not yet started)
docs/                             Documentation
```

## Getting started

```sh
dotnet build backend/factoryops-cmms.slnx
dotnet run --project backend/factoryops-cmms.API
dotnet test backend/factoryops-cmms.slnx
```
