# Virtual Classroom Demo

A virtual classroom system built with React.js frontend and Laravel backend, featuring LiveKit Cloud for real-time video/audio communication, tldraw for interactive whiteboards, and LibreOffice for document conversion.

## 🚀 Features

### Admin Session Creation
- **Route**: `/admin/create-session`
- Create classroom sessions with subject, tutor, and student information
- Generate unique session IDs
- Create role-based URLs for different participants
- Generate LiveKit JWT tokens for secure access

### Virtual Classroom
- **Route**: `/classroom/{sessionId}?role={tutor|student|moderator}`
- Real-time video and audio communication via LiveKit Cloud
- Interactive whiteboard using tldraw with real-time collaboration
- File upload support (PDF, DOCX, PPTX)
- Automatic document conversion to PNG using LibreOffice
- Role-based permissions and controls
- Noise cancellation and virtual background support
- Participant name input and room joining flow

## 🏗️ Architecture

### Frontend (React.js)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5.2.0
- **Routing**: React Router DOM 7.8.0
- **Video/Audio**: LiveKit Client SDK 2.15.4
- **Whiteboard**: tldraw 3.15.1 with sync capabilities
- **Styling**: CSS with modern design and responsive layout

### Backend (Laravel)
- **Framework**: Laravel 11
- **Database**: MySQL 8.0
- **Video/Audio**: LiveKit Server SDK (agence104/livekit-server-sdk 1.3)
- **File Processing**: LibreOffice CLI for document conversion
- **API**: RESTful API endpoints for session management and token generation

## 📋 Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ / Linux
- **PHP**: 8.1+
- **Node.js**: 18.19.1+
- **MySQL**: 8.0+
- **LibreOffice**: Latest version

### Required Packages
```bash
# PHP Extensions
sudo apt install php8.1-mysql php8.1-xml php8.1-curl php8.1-mbstring php8.1-zip

# LibreOffice
sudo apt install libreoffice

# MySQL
sudo apt install mysql-server-8.0 mysql-client-8.0
```

## 🛠️ Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Virtual-Classroom-Demo
```

### 2. Backend Setup (Laravel)

#### Navigate to Backend Directory
```bash
cd application-server
```

#### Install Dependencies
```bash
composer install
```

#### Environment Configuration
```bash
# Copy environment file
cp .env.example .env

# Generate application key
php artisan key:generate

# Update .env with your configuration
APP_NAME="Virtual Classroom Demo"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:6080

# Database Configuration
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=virtual_classroom
DB_USERNAME=virtual_user
DB_PASSWORD=VirtualClassroom123

# LiveKit Configuration
LIVEKIT_API_KEY=your-livekit-api-key-here
LIVEKIT_API_SECRET=your-livekit-api-secret-here
LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
```

#### Database Setup
```bash
# Create database and user
sudo mysql -u root -e "CREATE DATABASE virtual_classroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -u root -e "CREATE USER 'virtual_user'@'localhost' IDENTIFIED BY 'VirtualClassroom123';"
sudo mysql -u root -e "GRANT ALL PRIVILEGES ON virtual_classroom.* TO 'virtual_user'@'localhost';"
sudo mysql -u root -e "FLUSH PRIVILEGES;"

# Run migrations
php artisan migrate
```

#### Storage Setup
```bash
# Create storage directories
mkdir -p storage/app/public/uploads storage/app/public/converted
chmod -R 775 storage

# Create symbolic link
ln -sf ../storage/app/public public/storage
```

#### Start Backend Server
```bash
# Development server
php artisan serve --host=0.0.0.0 --port=6080

# Or using composer script
composer run dev
```

### 3. Frontend Setup (React.js)

#### Navigate to Frontend Directory
```bash
cd application-client
```

#### Install Dependencies
```bash
npm install
```

#### Start Development Server
```bash
npm start
```

The React app will be available at `http://localhost:5080`

## 🔧 Configuration

### LiveKit Cloud Setup
1. Sign up at [LiveKit Cloud](https://cloud.livekit.io/)
2. Create a new project
3. Get your API Key and Secret
4. Update the `.env` file with your credentials

### LibreOffice Configuration
Ensure LibreOffice is installed and accessible via command line:
```bash
# Test LibreOffice installation
soffice --version

# Test headless conversion
soffice --headless --convert-to png --outdir /tmp /path/to/test.pdf
```

## 📱 Usage

### 1. Create a Session
1. Navigate to `/admin/create-session`
2. Fill in the session details:
   - Class Subject
   - Tutor Name
   - Student Name
3. Click "Create Session"
4. Copy the generated role-based URLs

### 2. Join Classroom
1. Use the appropriate URL for your role:
   - **Tutor**: `/classroom/{sessionId}?role=tutor`
   - **Student**: `/classroom/{sessionId}?role=student`
   - **Moderator**: `/classroom/{sessionId}?role=moderator`
2. Enter your name when prompted
3. Allow camera and microphone permissions
4. Start collaborating!

### 3. File Management (Tutor Only)
1. Click the "📁 Upload" button
2. Select a PDF, DOCX, or PPTX file
3. The file will be automatically converted to PNG
4. View the converted image above the whiteboard

## 🔒 Security Features

- **JWT Token Authentication**: Secure LiveKit room access
- **Role-based Access Control**: Different permissions for different roles
- **File Upload Validation**: Secure file handling with type restrictions
- **CORS Configuration**: Proper cross-origin resource sharing setup

## 📁 Project Structure

```
Virtual-Classroom-Demo/
├── application-server/          # Laravel Backend
│   ├── app/
│   │   ├── Http/Controllers/   # API Controllers
│   │   │   ├── ClassroomController.php
│   │   │   ├── FileController.php
│   │   │   └── SessionController.php
│   │   ├── Models/             # Database Models
│   │   │   └── ClassroomSession.php
│   │   └── Providers/          # Service Providers
│   ├── config/                 # Configuration Files
│   │   └── livekit.php         # LiveKit configuration
│   ├── database/migrations/    # Database Migrations
│   ├── routes/                 # API Routes
│   │   └── api.php            # API endpoints
│   ├── storage/                # File Storage
│   │   └── app/public/
│   │       ├── uploads/        # Original uploaded files
│   │       └── converted/      # Converted PNG files
│   └── composer.json           # PHP Dependencies
├── application-client/          # React Frontend
│   ├── src/
│   │   ├── components/         # React Components
│   │   │   ├── AdminSessionCreation.tsx
│   │   │   ├── VirtualClassroom.tsx
│   │   │   ├── VideoComponent.tsx
│   │   │   └── AudioComponent.tsx
│   │   └── App.tsx            # Main Application
│   └── package.json            # Node.js Dependencies
└── README.md                   # This File
```

**Built with ❤️ using React.js, Laravel, LiveKit Cloud, and tldraw**
