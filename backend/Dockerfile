FROM eclipse-temurin:21-jdk-alpine-3.24 AS build

WORKDIR /workspace

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./

RUN ./mvnw --batch-mode dependency:go-offline

COPY src/ src/

RUN ./mvnw --batch-mode package -DskipTests \
    && cp target/urban-reports-*.jar target/app.jar

FROM eclipse-temurin:21-jre-alpine-3.24 AS runtime

RUN apk add --no-cache ffmpeg \
    && addgroup --system app \
    && adduser --system --ingroup app app

WORKDIR /app

COPY --from=build --chown=app:app /workspace/target/app.jar ./app.jar

USER app:app

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
