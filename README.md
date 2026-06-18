Hey, this is a lightweight webapp to classify beverage labels. The trickiest part was a combination of 3 requirements: sub 5-second latency, unstructured file upload, and simple interface. Because bottles might have multiple faces/labels, I needed a way to match the right photos together without a second inference pass (which would exceed 5s) or cumbersome human labeling. My solution was to pass incomplete extractions to the front of the prompt and allow the prompt to match a unique_key to an existing entity; all in one call. Because the prompt got heavy I ended up having to upgrade from gpt-5.4mini to gpt5.4.

I optimized the system against a test batch of photos. It works best when the different orientations are sequential, as the system will flag false matches for similar liquids/bottles. There is a test batch in the repo.

Since the hosted app is connected to my azure gpt-5.4 deployment, I've password gated the application. The password will be passed out of band.

The app will process any photos, but without a corresponding database record there won't be a match. Try going to the "edit forms" tab to seed more entries.

# TTB Label Extractor Prototype

An AI-powered web application designed to automatically extract structured data from beverage label forms using Azure OpenAI.

## 🏗️ Architecture

This application is built with a modern, serverless-first stack optimized for rapid AI prototyping:

- **Framework**: Next.js 16 (App Router) using React and Turbopack.
- **Frontend Design**: Vanilla CSS utilizing modern glassmorphism aesthetics, dynamic micro-animations, and a responsive grid layout.
- **AI Integration**: Azure OpenAI Service (`gpt-5.4`) accessed via the `@azure/openai` SDK. The AI is specifically prompted to extract structured JSON (Brand Name, Class/Type, Alcohol Content, etc.) from uploaded image data.
- **Database Storage**: A local SQLite database powered by `better-sqlite3`. This provides persistent storage for reviewing, validating, and approving AI-extracted forms without the overhead of an external SQL server during prototyping.
- **Authentication**: A global security layer requiring an Access Key. Unauthorized users see a frosted-glass overlay protecting the application until the correct key is provided.
- **Containerization**: Packaged via a multi-stage `Dockerfile` leveraging Next.js's `standalone` output for a drastically reduced image size.
- **Deployment**: Hosted on **Azure Container Apps** for a fully serverless, auto-scaling deployment.

## 🚀 Running Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env.local` file in the root directory containing:
   ```env
   EVALUATOR_ACCESS_KEY="YourAccessKeyHere"
   AZURE_OPENAI_ENDPOINT="https://your-resource.services.ai.azure.com/"
   AZURE_OPENAI_API_KEY="YourAzureApiKey"
   ```

3. **Start the Development Server**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000` to view the application.

## 🗄️ Database Management

The application uses a local SQLite database (`forms.db`) to manage records. 
You can view and manage the mock records by navigating to the hidden `/forms` route while authenticated. This provides an interface to approve labels or clear out the database.

## 🚢 Deployment (Azure)

Because Azure Container Apps requires `linux/amd64` architecture, the Docker image must be cross-compiled if building from an Apple Silicon (M-series) Mac:

```bash
# Build the image for AMD64
docker buildx build --platform linux/amd64 -t your-registry.azurecr.io/ttb-prototype:latest .

# Push to Azure Container Registry
docker push your-registry.azurecr.io/ttb-prototype:latest

# Deploy to Azure Container Apps
az containerapp create \
  --name ttb-prototype \
  --resource-group your-resource-group \
  --environment your-container-env \
  --image your-registry.azurecr.io/ttb-prototype:latest \
  --registry-server your-registry.azurecr.io \
  --ingress external \
  --target-port 3000 \
  --env-vars EVALUATOR_ACCESS_KEY="key" AZURE_OPENAI_ENDPOINT="url" AZURE_OPENAI_API_KEY="key"
```
