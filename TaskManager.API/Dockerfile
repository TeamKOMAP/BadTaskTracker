FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY TaskManager.sln ./
COPY TaskManager.API/TaskManager.API.csproj TaskManager.API/
COPY TaskManager.Application/TaskManager.Application.csproj TaskManager.Application/
COPY TaskManager.Domain/TaskManager.Domain.csproj TaskManager.Domain/
COPY TaskManager.Infrastructure/TaskManager.Infrastructure.csproj TaskManager.Infrastructure/

RUN dotnet restore TaskManager.API/TaskManager.API.csproj

COPY . .
RUN dotnet publish TaskManager.API/TaskManager.API.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
ENV PORT=8080

EXPOSE 8080

COPY --from=build /app/publish ./

ENTRYPOINT ["dotnet", "TaskManager.API.dll"]
