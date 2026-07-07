from langchain_ollama.chat_models import ChatOllama
from langchain_ollama.embeddings import OllamaEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()
chatModel = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    google_api_key=os.getenv("API_KEY"),
    temperature=0.7,
    top_k=20,
    top_p=0.5,
)

emdbModel=OllamaEmbeddings(model='embeddinggemma', num_ctx=2000)