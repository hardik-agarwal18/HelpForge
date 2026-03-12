# HelpForge

A modern microservices-based platform built with Node.js, Express, and PostgreSQL.

## 🏗️ Architecture

HelpForge follows a microservices architecture with the following services:

- **API Gateway**: Main entry point for client requests, handles authentication and routing

## 🚀 Technologies

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt
- **Validation**: Zod
- **Development**: Nodemon

## 📋 Prerequisites

Before running this project, make sure you have:

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## 🛠️ Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd helpForge
```

### 2. Install dependencies

```bash
cd services/api-gateway
npm install
```

### 3. Environment Configuration

Create a `.env` file in `services/api-gateway/`:

```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/helpForge?schema=public"
JWT_SECRET="your-secure-jwt-secret"
```

Replace `username` and `password` with your PostgreSQL credentials.

### 4. Database Setup

Run Prisma migrations to set up the database schema:

```bash
cd services/api-gateway
npx prisma migrate dev
```

To view your database with Prisma Studio:

```bash
npx prisma studio
```

### 5. Run the Application

**Development mode** (with auto-reload):

```bash
npm run dev
```

The API Gateway will start on `http://localhost:5000`

## 📁 Project Structure

```
helpForge/
├── services/
│   └── api-gateway/
│       ├── prisma/
│       │   ├── schema.prisma          # Database schema
│       │   └── migrations/            # Database migrations
│       ├── src/
│       │   ├── config/                # Configuration files
│       │   │   ├── database.config.js
│       │   │   └── index.js
│       │   ├── middleware/            # Express middleware
│       │   │   ├── auth.middleware.js
│       │   │   └── validation.middleware.js
│       │   ├── modules/               # Feature modules
│       │   │   └── auth/
│       │   │       ├── auth.controller.js
│       │   │       ├── auth.service.js
│       │   │       ├── auth.repo.js
│       │   │       ├── auth.routes.js
│       │   │       └── auth.validator.js
│       │   ├── utils/                 # Utility functions
│       │   │   └── errorHandler.js
│       │   ├── app.js                 # Express app configuration
│       │   └── server.js              # Server entry point
│       ├── .env                       # Environment variables
│       └── package.json
└── README.md
```

## 🔐 API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and receive JWT token

## 🗄️ Database Schema

### User Model

- `id`: UUID (Primary Key)
- `email`: String (Unique)
- `password`: String (Hashed)
- `name`: String (Optional)
- `createdAt`: DateTime

## 🔧 Development

### Database Commands

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Reset database
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

### Code Structure

The project follows a modular architecture:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Contain business logic
- **Repositories**: Handle database operations
- **Validators**: Validate request data using Zod
- **Middleware**: Process requests before reaching controllers

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 👥 Authors

Hardik Agarwal

## 🐛 Known Issues

- No known issues at this time

## 📚 Future Enhancements

- Add more microservices (e.g., notification service, ticket service)
- Implement rate limiting
- Add comprehensive test coverage
- Set up CI/CD pipeline
- Add API documentation with Swagger/OpenAPI
