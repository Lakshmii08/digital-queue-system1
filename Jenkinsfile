
pipeline {
    agent any

    triggers {
        pollSCM('H/2 * * * *')
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        DOCKER_PATH = 'C:\\Users\\Lakshmipriya\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin'
        IMAGE_NAME = 'digital-queue-system:latest'
        CONTAINER_NAME = 'queue-app'
        APP_PORT = '3001'
    }

    stages {
        stage('1. Checkout') {
            steps {
                checkout scm
            }
        }

        stage('2. Install Dependencies') {
            steps {
                bat 'npm ci'
            }
        }

        stage('3. Automated Tests') {
            steps {
                bat 'npm test'
            }
        }

        stage('4. Application Build') {
            steps {
                bat 'npm run build'
            }
        }

        stage('5. Check Docker') {
            steps {
                bat '''
                    set "PATH=%DOCKER_PATH%;%PATH%"
                    where docker
                    docker --version
                    docker info
                '''
            }
        }

        stage('6. Docker Build') {
            steps {
                bat '''
                    set "PATH=%DOCKER_PATH%;%PATH%"
                    docker build -t %IMAGE_NAME% .
                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('7. Deploy Container') {
            steps {
                bat '''
                    set "PATH=%DOCKER_PATH%;%PATH%"

                    docker rm -f %CONTAINER_NAME% 2>nul
                    docker run -d --name %CONTAINER_NAME% -p %APP_PORT%:3000 --restart unless-stopped %IMAGE_NAME%

                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('8. Verify Deployment') {
            steps {
                bat '''
                    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; for ($i=0; $i -lt 15; $i++) { try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:3001/health; if ($r.StatusCode -eq 200) { Write-Host 'Health check passed'; exit 0 } } catch {}; Start-Sleep -Seconds 2 }; Write-Error 'Health check failed'; exit 1"
                '''
            }
        }
    }

    post {
        success {
            echo 'SUCCESS: Tests passed, Docker image built, and application deployed.'
            echo 'Application URL: http://localhost:3001'
            echo 'Health URL: http://localhost:3001/health'
        }

        failure {
            echo 'PIPELINE FAILED: Open Console Output and inspect the first failed stage.'
        }

        always {
            echo 'Digital Queue CI/CD pipeline execution completed.'
        }
    }
}
