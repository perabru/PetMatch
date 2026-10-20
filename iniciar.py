"""Servidor local opcional do PetMatch. Requer Python 3.8 ou superior."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    folder = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(folder))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    except OSError:
        print("Não foi possível iniciar o PetMatch na porta 8765.")
        print("Feche outra instância do servidor, ou tente abrir http://127.0.0.1:8765/.")
        return 1
    with server:
        address = "http://127.0.0.1:8765/"
        print(f"PetMatch disponível em {address}")
        print("Mantenha este terminal aberto. Pressione Ctrl+C para encerrar.")
        print("Se o navegador não abrir, copie o endereço acima.")
        timer = threading.Timer(0.4, webbrowser.open, args=(address,))
        timer.daemon = True
        timer.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
