"""Index every .md/.txt file in ./knowledge into ChromaDB. Re-run after editing files."""
from pathlib import Path

from rag import collection


def chunk(text: str, size: int = 700, overlap: int = 100):
    text = " ".join(text.split())
    step = size - overlap
    return [text[i : i + size] for i in range(0, max(len(text), 1), step) if text[i : i + size].strip()]


def main():
    col = collection()
    files = sorted(list(Path("knowledge").glob("*.md")) + list(Path("knowledge").glob("*.txt")))
    for f in files:
        parts = chunk(f.read_text(encoding="utf-8"))
        col.upsert(
            ids=[f"{f.name}-{i}" for i in range(len(parts))],
            documents=parts,
            metadatas=[{"source": f.stem} for _ in parts],
        )
        print(f"Indexed {f.name}: {len(parts)} chunks")
    print("Total chunks:", col.count())


if __name__ == "__main__":
    main()
