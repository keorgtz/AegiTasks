FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY AegiTasks.Api/AegiTasks.Api.csproj AegiTasks.Api/
RUN dotnet restore AegiTasks.Api/AegiTasks.Api.csproj
COPY . .
RUN dotnet publish AegiTasks.Api/AegiTasks.Api.csproj -c Release -o /out --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p /app/storage/uploads /app/storage/keys && chown -R app:app /app/storage
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "AegiTasks.Api.dll"]
