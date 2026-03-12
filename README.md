# HelpForge

**AI-Powered Multi-Tenant Support Platform**

HelpForge is a comprehensive enterprise-grade support platform combining intelligent ticket management, AI-powered chatbot (RAG), workflow automation, and microservices architecture. Built to demonstrate modern full-stack development, AI integration, and DevOps best practices.

> 📚 **[View Complete Project Roadmap →](./PROJECT_ROADMAP.md)**

---

## 🌟 Key Features

### ✅ Currently Implemented

- 🔐 **Authentication System** - JWT-based auth with bcrypt password hashing
- 🚪 **API Gateway** - Request routing, validation, and authentication
- 🗄️ **PostgreSQL Database** - Prisma ORM with migrations
- ✅ **Comprehensive Testing** - 49 tests with 98.87% coverage
- 📝 **Complete Documentation** - API docs, test docs, and roadmap

### 🔄 In Development

- 🏢 **Multi-Tenant Organizations** - Support multiple companies with role-based access
- 🎫 **Ticket Management** - Complete support ticket system with assignments, priorities
- 📁 **Knowledge Base** - Document management system
- 🤖 **AI Chatbot (RAG)** - Context-aware responses using vector search
- 📊 **Analytics Dashboard** - Real-time metrics and insights

### 🔮 Planned

- 🧠 **AI Agents** - Intelligent automation for ticket classification and routing
- ⚡ **Event-Driven Architecture** - Kafka-based microservice communication
- 🔔 **Notifications** - Email, Slack, webhook integrations
- 🔄 **Workflow Automation** - n8n for no-code automation
- ☸️ **Kubernetes Deployment** - Production-ready containerized deployment

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  HelpForge Platform                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Frontend (React) ──► API Gateway ──► Microservices     │
│                            │                             │
│                      ┌─────┴─────┐                       │
│                      │           │                       │
│              ┌───────▼──┐    ┌──▼───────┐               │
│              │  Auth    │    │  Ticket  │               │
│              │ Service  │    │ Service  │               │
│              └──────────┘    └──────────┘               │
│                                                           │
│              ┌──────────┐    ┌──────────┐               │
│              │    AI    │    │Document  │               │
│              │ Service  │    │ Service  │               │
│              └──────────┘    └──────────┘               │
│                      │           │                       │
│              ┌───────┴───────────┴──────┐                │
│              │  PostgreSQL + pgvector   │                │
│              │  Redis  │  Kafka  │  S3  │                │
│              └──────────────────────────┘                │
└───────────────────────────────────────────────────────────┘
```

### Current Services

- **api-gateway** ✅ - Authentication, routing, validation
- **ticket-service** 🔄 - Ticket management (planned)
- **document-service** 🔄 - Knowledge base (planned)
- **ai-service** 🔄 - RAG chatbot (planned)
- **organization-service** 🔄 - Multi-tenancy (planned)

---

## 🚀 Technology Stack

### Backend

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL 16+ with Prisma ORM
- **Validation:** Zod schemas
- **Testing:** Jest + Supertest (98.87% coverage)
- **Authentication:** JWT + bcrypt

### AI/ML (Planned)

- **LLM:** OpenAI GPT-4, Claude 3.5
- **Embeddings:** OpenAI text-embedding-3-small
- **Vector DB:** PostgreSQL with pgvector extension
- **Framework:** LangChain / LlamaIndex

### Infrastructure (Planned)

- **Containerization:** Docker
- **Orchestration:** Kubernetes
- **Message Queue:** Kafka / RabbitMQ
- **Cache:** Redis
- **Storage:** AWS S3 / MinIO
- **Monitoring:** Prometheus + Grafana
- **CI/CD:** GitHub Actions

---

## 📊 Project Status

| Component              | Status         | Coverage | Documentation |
| ---------------------- | -------------- | -------- | ------------- |
| Authentication         | ✅ Complete    | 100%     | ✅            |
| API Gateway            | ✅ Complete    | 100%     | ✅            |
| Testing Infrastructure | ✅ Complete    | 98.87%   | ✅            |
| Organizations          | 🔄 In Progress | -        | 📝            |
| Ticket System          | 📋 Planned     | -        | 📝            |
| AI Chatbot (RAG)       | 📋 Planned     | -        | 📝            |
| Document Processing    | 📋 Planned     | -        | 📝            |
| Kubernetes Deployment  | 📋 Planned     | -        | 📝            |

**Legend:** ✅ Complete | 🔄 In Progress | 📋 Planned | 📝 Documented

---

## 🛠️ Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm or yarn

### Installation

```bash
# Clone repository
git clone <repository-url>
cd helpForge

# Install dependencies
cd services/api-gateway
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The API Gateway will be running at `http://localhost:5000`

---

## 🧪 Testing

HelpForge has comprehensive test coverage with Jest and Supertest.

### Test Coverage

```
Statements: 98.87%
Branches:   95.83%
Functions:  93.33%
Lines:      100%
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Test Structure

```
tests/
├── setup.js                    # Global test setup
├── helpers/
│   └── dbHelper.js            # Test utilities
├── integration/
│   ├── app.test.js           # App integration tests
│   └── auth.test.js          # Auth API tests (14 tests)
└── unit/
    ├── auth.controller.test.js  # Controller tests (6 tests)
    ├── auth.service.test.js     # Service tests (8 tests)
    ├── middleware.test.js       # Middleware tests (12 tests)
    └── errorHandler.test.js     # Error handler tests (7 tests)
```

📚 **[View Complete Test Documentation →](./services/api-gateway/TEST_DOCUMENTATION.md)**

---

## 📁 Project Structure

```
helpForge/
├── services/
│   └── api-gateway/              ✅ Implemented
│       ├── prisma/
│       │   ├── schema.prisma     # Database schema
│       │   └── migrations/       # Migration history
│       ├── src/
│       │   ├── config/           # Configuration
│       │   ├── middleware/       # Express middleware
│       │   ├── modules/          # Feature modules
│       │   │   └── auth/        # Authentication module
│       │   ├── utils/           # Utilities
│       │   ├── app.js           # Express app
│       │   └── server.js        # Server entry
│       ├── tests/               # Test suites
│       ├── .env                 # Environment variables
│       ├── jest.config.js       # Jest configuration
│       └── package.json
├── PROJECT_ROADMAP.md           # Complete feature roadmap
├── TEST_DOCUMENTATION.md        # Testing guide
└── README.md                    # This file
```

---

## 🔐 API Documentation

### Authentication Endpoints

#### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "jwt-token-here"
  }
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "jwt-token-here"
  }
}
```

#### Get Profile (Protected)

```http
GET /api/auth/profile
Authorization: Bearer <jwt-token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2026-03-12T10:00:00.000Z"
  }
}
```

---

## 🗄️ Database Schema

### Current Schema (Phase 1)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Planned Schema (Phase 2+)

See [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md) for complete database schema including:

- Organizations
- Memberships
- Tickets
- Documents
- Comments
- Conversations

---

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start with auto-reload
npm start                # Start production server

# Testing
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage
npm run test:watch       # Run tests in watch mode
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only

# Database
npx prisma migrate dev   # Create and apply migration
npx prisma migrate reset # Reset database
npx prisma generate      # Generate Prisma Client
npx prisma studio        # Open database GUI
```

### Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/helpforge"
DATABASE_URL_TEST="postgresql://user:password@localhost:5432/helpforge_test"

# Authentication
JWT_SECRET="your-secret-key-here"
JWT_EXPIRES_IN="7d"
```

### Code Quality

- **Linting:** ESLint (if configured)
- **Formatting:** Prettier (if configured)
- **Testing:** Jest + Supertest
- **Type Safety:** JSDoc comments (TypeScript coming soon)

---

## 📚 Documentation

| Document                                                              | Description                               |
| --------------------------------------------------------------------- | ----------------------------------------- |
| [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)                            | Complete feature roadmap with 25+ systems |
| [TEST_DOCUMENTATION.md](./services/api-gateway/TEST_DOCUMENTATION.md) | Testing strategy and coverage report      |
| [README.md](./README.md)                                              | This file - project overview              |

---

## 🎯 Roadmap

### Phase 1: Foundation ✅ (Current)

- [x] Authentication system
- [x] API Gateway
- [x] Testing infrastructure
- [x] Documentation

### Phase 2: Core Features (Q1 2026)

- [ ] Multi-tenant organizations
- [ ] Ticket management system
- [ ] User management
- [ ] File storage

### Phase 3: AI Integration (Q2 2026)

- [ ] Document processing pipeline
- [ ] Vector database (pgvector)
- [ ] RAG chatbot
- [ ] Embedding service

### Phase 4: Advanced Features (Q3 2026)

- [ ] AI agents
- [ ] Event-driven architecture (Kafka)
- [ ] Automation workflows (n8n)
- [ ] Analytics dashboard

### Phase 5: Production (Q4 2026)

- [ ] Kubernetes deployment
- [ ] Monitoring (Prometheus + Grafana)
- [ ] CI/CD pipeline
- [ ] Performance optimization

📚 **[View Complete Roadmap →](./PROJECT_ROADMAP.md)**

---

## 🎓 What This Project Demonstrates

### Backend Engineering

✅ RESTful API design  
✅ Microservices architecture  
✅ Database modeling (Prisma)  
✅ Authentication & authorization  
✅ Input validation (Zod)  
✅ Error handling  
✅ Testing (98.87% coverage)

### AI/ML Engineering (Coming Soon)

⏳ RAG (Retrieval-Augmented Generation)  
⏳ Vector databases  
⏳ LLM integration  
⏳ Prompt engineering  
⏳ AI agent development

### DevOps (Coming Soon)

⏳ Docker containerization  
⏳ Kubernetes orchestration  
⏳ CI/CD pipelines  
⏳ Infrastructure as code  
⏳ Monitoring & logging

### System Design

✅ Scalability  
✅ Security best practices  
✅ Code organization  
⏳ High availability  
⏳ Performance optimization

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Maintain test coverage above 95%
- Follow existing code style
- Update documentation
- Use conventional commits

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

Built with ❤️ as a comprehensive demonstration of:

- Modern backend architecture
- AI/ML integration
- DevOps best practices
- Production-ready code

---

## 🔗 Links

- **Documentation:** [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)
- **Tests:** [TEST_DOCUMENTATION.md](./services/api-gateway/TEST_DOCUMENTATION.md)
- **Issues:** [GitHub Issues](https://github.com/your-username/helpforge/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-username/helpforge/discussions)

---

## ⭐ Star This Project

If you find this project helpful, please consider giving it a star! It helps others discover this comprehensive example of modern software engineering.

---

**Status:** 🚧 Active Development  
**Phase:** 1 - Foundation (75% Complete)  
**Next Milestone:** Organization & Ticket Management  
**Last Updated:** March 12, 2026

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
```
