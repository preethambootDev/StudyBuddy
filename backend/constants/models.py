import os
from dotenv import load_dotenv
from langchain_ollama.chat_models import ChatOllama
from langchain_ollama.embeddings import OllamaEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

load_dotenv()

chatModel = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0.7,
    top_k=20,
    top_p=0.5,
)

emdbModel = GoogleGenerativeAIEmbeddings(model="gemini-embedding-2")