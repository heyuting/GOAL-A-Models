# GOAL-A Models System Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Components](#system-components)
3. [Architecture Layers](#architecture-layers)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Deployment Architecture](#deployment-architecture)
7. [HPC Integration](#hpc-integration)
8. [API Endpoints](#api-endpoints)
9. [Security Architecture](#security-architecture)
10. [Data Storage](#data-storage)

---

## Overview

The GOAL-A Models system is a web-based platform for running and managing environmental simulation models (DRN, SCEPTER, ATS) that execute on Yale HPC. The system consists of a React frontend, a Flask proxy API backend, and integration with Firebase for authentication and data persistence.

### Key Characteristics

- **Distributed Architecture**: Frontend, backend, and HPC compute resources are geographically separated
- **Asynchronous Job Processing**: Long-running model simulations are submitted to HPC queue system
- **Real-time Status Monitoring**: Polling-based status updates for job progress
- **Multi-tenant**: User authentication and model data isolation via Firebase

---

## System Components

### 1. Frontend Application (React/Vite)

**Location**: `GOAL-A-Models/`
**Technology**: React 19, Vite, TailwindCSS, React Router

**Responsibilities**:

- User interface for model configuration
- Interactive map-based location selection (Leaflet)
- Real-time job status visualization
- User authentication UI
- Model results visualization and download

**Key Components**:

- `DRNconfig.jsx` - DRN model configuration interface
- `SCEPTERconfig.jsx` - SCEPTER model interface
- `ATSconfig.jsx` - ATS model interface
- `UserDashboard.jsx` - User account and saved models management
- `Map.jsx` - Interactive map component for location selection

### 2. Backend Proxy API (Flask)

**Location**: `goal_a_proxy_api/`
**Technology**: Flask, Paramiko (SSH), Python

**Responsibilities**:

- Proxy requests between frontend and HPC cluster
- SSH connection management to Yale HPC
- SLURM job submission and monitoring
- CORS handling for cross-origin requests
- Job status caching and management

**Key Features**:

- SSH connection pooling to minimize DUO 2FA prompts
- Background job submission threads
- SLURM queue integration
- Error handling and logging

### 3. Firebase Services

**Technology**: Firebase Auth, Firestore

**Responsibilities**:

- User authentication and authorization
- User profile management
- Saved model configurations persistence
- Job metadata storage

**Collections**:

- `savedModels` - User's saved model configurations and results metadata
- User profiles stored in localStorage (legacy) with Firestore migration

### 4. Yale HPC Cluster

**Location**: `bouchet.ycrc.yale.edu` 
**Technology**: SLURM, Python, Scientific computing stack

**Responsibilities**:

- Model execution (DRN, SCEPTER, ATS)
- Data processing and computation
- Result file storage
- Job queue management

**Model Execution Pipeline** (DRN):

1. Site Selection (watershed identification)
2. Sample Interpolation
3. DRN Preparation
4. DRN Run (simulation)
5. Compile Results

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  React Frontend (Vite) - User Interface & Visualization     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/REST API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Application Layer                         │
│  Flask Proxy API - Request Routing & Job Management         │
└──────────────────────┬──────────────────────────────────────┘
                       │ SSH/Paramiko
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Service Layer                             │
│  Firebase Auth & Firestore - Authentication & Data Storage  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    Compute Layer                             │
│  Yale HPC (SLURM) - Model Execution & Processing            │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Job Submission Flow

```
1. User Configures Model (Frontend)
   ├─ Selects locations on map
   ├─ Sets parameters (feedstock, time steps, etc.)
   └─ Clicks "Run Model"

2. Frontend → Backend API
   POST /api/drn/full-pipeline
   {
     coordinates: [[lat, lng], ...],
     rate_rock: 1.0,
     month_run: 12,
     time_step: 1.0,
     feedstock: "basalt",
     monte_count: 0
   }

3. Backend Validates & Prepares
   ├─ Validates input parameters
   ├─ Generates unique job_id
   ├─ Creates job folder structure on HPC
   └─ Prepares SLURM batch script

4. Backend → Yale HPC (SSH)
   ├─ Establishes SSH connection (with DUO 2FA)
   ├─ Creates job directory
   ├─ Writes parameters.json
   ├─ Writes SLURM batch script
   └─ Submits job via sbatch

5. Backend → Frontend (Immediate Response)
   {
     job_id: "drn_full_1234567890_1234",
     status: "submitting",
     hpc_job_id: null  // Will be set after submission
   }

6. Background Thread (Backend)
   ├─ Monitors SLURM submission
   ├─ Updates job status in cache
   └─ Sets hpc_job_id when available

7. Frontend Polling
   GET /api/drn/full-pipeline/{job_id}/status
   ├─ Backend queries SLURM queue (squeue)
   ├─ Checks job logs for progress
   ├─ Updates step information
   └─ Returns current status

8. Job Completion
   ├─ SLURM job completes
   ├─ Results saved to HPC filesystem
   ├─ Status updated to "completed"
   └─ Frontend enables download
```

### Status Polling Flow

```
Frontend (Every 2-5 seconds)
    │
    ├─→ GET /api/drn/full-pipeline/{job_id}/status
    │
Backend
    │
    ├─→ SSH to Yale HPC
    │   ├─→ squeue -j {hpc_job_id}  (Check SLURM queue)
    │   ├─→ Check job logs for step progress
    │   └─→ Check completion marker (.completed file)
    │
    └─→ Return status to Frontend
        {
          job_id: "...",
          status: "running",
          current_step: "Step 3: DRN Preparation",
          step_progress: {
            step: 3,
            name: "DRN Preparation",
            status: "running"
          }
        }
```

---

## Technology Stack

### Frontend

- **Framework**: React 19.0.0
- **Build Tool**: Vite 6.2.0
- **Routing**: React Router DOM 7.6.3
- **Styling**: TailwindCSS 4.0.14
- **Maps**: Leaflet 1.9.4, React-Leaflet 5.0.0
- **Charts**: Recharts 2.15.3
- **UI Components**: Radix UI, Lucide React
- **State Management**: React Hooks (useState, useEffect, useContext)

### Backend

- **Framework**: Flask (Python)
- **SSH Client**: Paramiko
- **CORS**: Flask-CORS
- **Environment**: python-dotenv
- **Logging**: Python logging module

### Infrastructure

- **Authentication**: Firebase Authentication
- **Database**: Firebase Firestore
- **HPC**: Yale HPC Cluster (SLURM)
- **Tunneling**: ngrok (for local development)

### Development Tools

- **Package Manager**: npm
- **Linting**: ESLint
- **Version Control**: Git

---

## Deployment Architecture

### Production Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Netlify / Cloud Hosting                         │
│  Frontend (Static React Build)                               │
│  - Served via CDN                                            │
│  - Environment: Production                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ REST API (HTTPS)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              ngrok Tunnel / Cloud Server                     │
│  Flask Backend API (Port 8000)                              │
│  - Runs on local machine with VPN access                     │
│  - Exposed via ngrok tunnel                                  │
│  - Environment variables:                                    │
│    * HPC_HOST (or GRACE_HOST for legacy)                     │
│    * HPC_USER (or GRACE_USER for legacy)                     │
│    * SSH_PRIVATE_KEY                                         │
│    * CORS_ORIGINS                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ SSH (via VPN)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Yale VPN Network                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ SSH/Paramiko
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Yale HPC Cluster                                │
│  (bouchet.ycrc.yale.edu)                              │
│  - SLURM job scheduler                                       │
│  - Model execution environment                               │
│  - Result file storage                                       │
└─────────────────────────────────────────────────────────────┘
```

### Local Development

```
┌─────────────────────────────────────────────────────────────┐
│              Local Development Machine                       │
│                                                              │
│  ┌────────────────────┐    ┌────────────────────┐           │
│  │  Vite Dev Server   │    │  Flask Backend     │           │
│  │  localhost:5173    │───▶│  localhost:8000    │           │
│  │  (Hot Reload)      │    │  (Proxy API)       │           │
│  └────────────────────┘    └────────┬──────────┘           │
│                                      │                       │
│                                      │ SSH                   │
│                                      │                       │
└──────────────────────────────────────┼───────────────────────┘
                                       │
                                       │ (via VPN)
                                       │
┌──────────────────────────────────────▼───────────────────────┐
│              Yale HPC Cluster                                 │
│              (bouchet.ycrc.yale.edu)                   │
└───────────────────────────────────────────────────────────────┘
```

---

## HPC Integration

### SSH Connection Management

**Connection Method**: Paramiko (Python SSH client)
**Authentication**: SSH Private Key + DUO 2FA

**Connection Pooling**:

- Reuses SSH connections to minimize DUO 2FA prompts
- Connection timeout: 30 minutes
- Keepalive: 30 seconds
- Auto-reconnection on failure

**Connection Flow**:

```
1. Backend receives request
2. Check for existing pooled connection
3. If connection exists and is alive:
   └─→ Reuse connection
4. If no connection or dead:
   ├─→ Create new SSH connection
   ├─→ Authenticate with private key
   ├─→ Handle DUO 2FA prompt (if required)
   └─→ Store in connection pool
```

### SLURM Job Management

**Job Submission**:

```bash
sbatch /path/to/job.sh
# Returns: "Submitted batch job 12345"
```

**Status Checking**:

```bash
squeue -j {job_id} --format='%T' --noheader
# Returns: PENDING, RUNNING, COMPLETED, FAILED, etc.
```

**Job Script Structure** (DRN Full Pipeline):

```bash
#!/bin/bash
#SBATCH --job-name=drn_full_{job_id}
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64G
#SBATCH --time=24:00:00
#SBATCH --output={job_folder}/%x_%j.out
#SBATCH --error={job_folder}/%x_%j.err

# Step 1: Site Selection
python3 01_site_selection.py --coords-file {coords.json} --output-dir {output_dir}

# Step 2: Sample Interpolation
python3 02_sample_interpolation.py --monte-count {count} --output-dir {output_dir}

# Step 3: DRN Preparation
python3 03_DRN_prep.py --feedstock {feedstock} --rate-rock {rate} --output-dir {output_dir}

# Step 4: DRN Run
python3 04_DRN_run.py --year-run {years} --time-step {step} --output-dir {output_dir}

# Step 5: Compile Results
python3 05_after_DRN_compile.py --output-dir {output_dir}
```

### File System Structure (HPC)

```
/home/{GRACE_USER}/project/DRN/
├── jobs/
│   └── {job_id}/
│       ├── parameters.json          # Job parameters
│       ├── coords.json              # Input coordinates
│       ├── job.sh                   # SLURM batch script
│       ├── .completed               # Completion marker
│       ├── {job_id}_*.out          # SLURM output logs
│       ├── {job_id}_*.err          # SLURM error logs
│       └── output/
│           ├── shp/                 # Shapefile outputs
│           ├── data/                # Processed data
│           └── figure/              # Generated figures
└── R_code/
    └── python_version/
        ├── 01_site_selection.py
        ├── 02_sample_interpolation.py
        ├── 03_DRN_prep.py
        ├── 04_DRN_run.py
        └── 05_after_DRN_compile.py
```

---

## API Endpoints

### DRN Full Pipeline

**POST** `/api/drn/full-pipeline`

- Submit complete DRN pipeline (Steps 1-5)
- Returns: `{job_id, status: "submitting", bouchet_job_id: null}`

**GET** `/api/drn/full-pipeline/{job_id}/status`

- Check job status and progress
- Returns: `{job_id, status, current_step, step_progress, logs}`

**GET** `/api/drn/full-pipeline/{job_id}/results`

- Get job results metadata
- Returns: `{job_id, status, results}`

**GET** `/api/drn/full-pipeline/{job_id}/download`

- Download results as ZIP file
- Returns: Binary ZIP file

### Outlet Compatibility Check

**POST** `/api/drn/check-outlet-compatibility`

- Check if multiple locations share same outlet
- Runs locally on backend server
- Returns: `{same_outlet: bool, outlet_comids: [], watersheds: {}}`

### Watershed Generation

**POST** `/api/drn/generate-watershed`

- Generate watersheds for selected locations
- Runs locally on backend server
- Returns: `{watersheds: {sf_ws_all: {}, sf_river_ode: {}, ...}}`

### Legacy Job Management

**POST** `/api/run-job`

- Submit DRN job (legacy format)
- Returns: `{job_id, status: "submitted"}`

**GET** `/api/check-job-status/{job_id}`

- Check legacy job status
- Returns: `{job_id, status, logs, slurm_status}`

---

## Security Architecture

### Authentication Flow

```
1. User Login (Frontend)
   ├─→ Firebase Auth: signInWithEmailAndPassword()
   ├─→ Email verification check
   └─→ User profile loaded from Firestore

2. API Requests
   ├─→ Frontend includes user context
   ├─→ Backend validates CORS origin
   └─→ No explicit auth tokens (relies on CORS + user context)

3. HPC Access
   ├─→ SSH private key authentication
   ├─→ DUO 2FA (when required)
   └─→ User-specific job folders
```

### Security Measures

**Frontend**:

- Firebase Authentication with email verification
- HTTPS-only in production
- CORS restrictions
- Input validation and sanitization

**Backend**:

- CORS origin whitelist
- Environment variable for sensitive data
- SSH key-based authentication
- Error message sanitization

**HPC**:

- VPN-required access
- User-specific directories
- SLURM job isolation
- File system permissions

### Environment Variables

**Backend (.env)**:

```env
GRACE_HOST=grace.ycrc.yale.edu
GRACE_USER=yhs5
SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
CORS_ORIGINS=http://localhost:5173,https://your-domain.netlify.app
```

---

## Data Storage

### Frontend (Browser)

- **localStorage**:
  - Job state cache (`drn_job_{job_id}`)
  - Latest job ID (`drn_latest_job_id`)
  - User preferences

### Firebase Firestore

- **Collection**: `savedModels`
  - Document structure:
    ```json
    {
      "id": "timestamp",
      "userId": "firebase_uid",
      "type": "DRN",
      "model": "DRN",
      "name": "DRN Model - Job ID: ...",
      "jobId": "drn_full_...",
      "status": "completed",
      "locations": [...],
      "parameters": {...},
      "currentStep": "Step 5: Compile Results",
      "stepProgress": {...},
      "createdAt": "2025-12-09T...",
      "savedAt": "2025-12-09T...",
      "completedAt": "2025-12-09T..."
    }
    ```

### HPC File System

- **Job Directories**: `/home/{user}/project/DRN/jobs/{job_id}/`
- **Output Files**: Shapefiles, CSV, Pickle files, PDFs
- **Logs**: SLURM output and error logs

### Backend (In-Memory)

- **JOB_STATUS_CACHE**: Dictionary mapping job_id to job metadata
- **SSH Connection Pool**: Reusable SSH connections

---

## Error Handling

### Frontend Error Handling

- Network errors: User-friendly messages
- Validation errors: Inline form validation
- API errors: Displayed in UI with retry options
- Console logging for debugging

### Backend Error Handling

- Try-catch blocks around all SSH operations
- Graceful fallback for connection failures
- Detailed error logging
- JSON error responses with status codes

### HPC Error Handling

- SLURM job failure detection
- Log file parsing for error messages
- Step-level error tracking
- Automatic retry for transient failures

---

## Performance Considerations

### Frontend

- Code splitting via Vite
- Lazy loading of map components
- Debounced status polling (2-5 second intervals)
- LocalStorage caching for job state

### Backend

- SSH connection pooling (reduces DUO prompts)
- Background job submission threads
- In-memory job status cache
- Efficient SLURM query patterns

### HPC

- SLURM queue management
- Resource allocation (CPU, memory, time)
- Parallel processing where possible
- Result file compression for downloads

---

## Future Enhancements

### Potential Improvements

1. **WebSocket Support**: Real-time status updates instead of polling
2. **Redis Cache**: Replace in-memory cache for multi-instance deployment
3. **Job Queue System**: Celery or similar for better job management
4. **Result Streaming**: Stream large result files instead of ZIP download
5. **Multi-model Support**: Unified interface for all models (DRN, SCEPTER, ATS)
6. **Batch Processing**: Submit multiple jobs simultaneously
7. **Result Visualization**: In-browser visualization of model outputs
8. **Notification System**: Email/SMS notifications for job completion

---

## Maintenance & Monitoring

### Logging

- **Frontend**: Console logs for debugging
- **Backend**: Python logging module (DEBUG level)
- **HPC**: SLURM output/error logs

### Monitoring Points

- SSH connection health
- SLURM queue status
- Job completion rates
- Error rates and types
- API response times

### Backup & Recovery

- Firestore automatic backups
- HPC job results retained in user directories
- LocalStorage can be cleared (data recoverable from Firestore)

---

## Conclusion

The GOAL-A Models system provides a distributed, scalable architecture for running computationally intensive environmental models on Yale's HPC infrastructure. The separation of concerns between frontend, backend, and compute resources allows for flexibility and scalability while maintaining security through proper authentication and access controls.

**Key Strengths**:

- Clear separation of concerns
- Asynchronous job processing
- Real-time status monitoring
- Secure HPC access via SSH
- User-friendly web interface

**Architecture Decisions**:

- Flask proxy API enables HPC access without exposing cluster directly
- Firebase provides scalable authentication and data storage
- React provides responsive, interactive user experience
- SLURM integration ensures proper resource management on HPC
