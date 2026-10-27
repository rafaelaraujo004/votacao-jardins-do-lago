class CabecalhosSeguranca:
    """CSP sem scripts de terceiros e cache desligado nas telas de voto."""

    CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
           "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", self.CSP)
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if not request.path.startswith(("/static/", "/comissao/admin/")):
            response["Cache-Control"] = "no-store"
        return response
