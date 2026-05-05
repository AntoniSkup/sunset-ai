import {
  LegalContactCard,
  LegalHighlight,
  LegalLink,
  LegalList,
  LegalPageHeader,
  LegalSection,
} from "../_components";
import { LegalDraftBanner } from "../_draft-banner";

export default function PrivacyPagePl() {
  return (
    <article>
      <LegalDraftBanner />

      <LegalPageHeader
        title="Polityka prywatności"
        lastUpdated="25 kwietnia 2026"
      />

      <LegalHighlight>
        Stronka AI („my", „nas", „nasze") dba o ochronę Twoich danych
        osobowych. Niniejsza Polityka prywatności wyjaśnia, jakie dane
        zbieramy, w jakim celu oraz jakie prawa przysługują Ci na mocy
        Ogólnego rozporządzenia o ochronie danych (RODO).
      </LegalHighlight>

      <div className="space-y-10">
        <LegalSection title="1. Administrator danych">
          <p>
            Administratorem Twoich danych osobowych jest Stronka AI z
            siedzibą w Polsce. Dane kontaktowe znajdują się w punkcie 12
            poniżej.
          </p>
        </LegalSection>

        <LegalSection title="2. Jakie dane zbieramy">
          <p>Zbieramy następujące kategorie danych osobowych:</p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane konta:
              </strong>{" "}
              imię, adres email oraz hasło (zaszyfrowane) podawane przy
              rejestracji.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane rozliczeniowe:
              </strong>{" "}
              informacje płatnicze przetwarzane przez naszego zewnętrznego
              dostawcę płatności. Nie przechowujemy pełnych numerów kart
              kredytowych.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane o użytkowaniu:
              </strong>{" "}
              odwiedzane strony, używane funkcje, typ przeglądarki, informacje
              o urządzeniu oraz adres IP.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane treści:
              </strong>{" "}
              landing page'e, teksty, obrazy i inne treści tworzone w ramach
              naszego serwisu.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane komunikacji:
              </strong>{" "}
              wiadomości wysyłane do naszego zespołu wsparcia.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="3. Cele i podstawy prawne przetwarzania">
          <p>
            Przetwarzamy Twoje dane osobowe w następujących celach i na
            podstawie następujących przesłanek prawnych:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Świadczenie usługi
              </strong>{" "}
              — przetwarzanie jest niezbędne do wykonania umowy zawartej z
              Tobą (art. 6 ust. 1 lit. b RODO).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Realizacja płatności
              </strong>{" "}
              — wykonanie umowy (art. 6 ust. 1 lit. b RODO).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Wysyłka wiadomości serwisowych
              </strong>{" "}
              (np. potwierdzenia konta, alerty bezpieczeństwa) — prawnie
              uzasadniony interes (art. 6 ust. 1 lit. f RODO).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Wysyłka wiadomości marketingowych
              </strong>{" "}
              — wyłącznie na podstawie Twojej wyraźnej zgody (art. 6 ust. 1
              lit. a RODO). Możesz w każdej chwili wycofać zgodę.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Doskonalenie usługi
              </strong>{" "}
              — prawnie uzasadniony interes polegający na rozumieniu, jak
              użytkownicy korzystają z Stronka AI (art. 6 ust. 1 lit. f
              RODO).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Wypełnianie obowiązków prawnych
              </strong>{" "}
              — np. wymogi podatkowe i księgowe (art. 6 ust. 1 lit. c RODO).
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="4. Treści generowane przez AI">
          <p>
            Stronka AI korzysta z zewnętrznych usług AI (takich jak modele
            językowe) do generowania treści landing page'y w Twoim imieniu.
            Korzystając z tych funkcji, Twoje polecenia i instrukcje mogą być
            przesyłane do naszego dostawcy AI w celu przetwarzania. Nie
            wykorzystujemy Twoich treści do trenowania modeli AI. Szczegóły
            dotyczące przetwarzania danych po stronie dostawcy AI znajdziesz w
            jego polityce prywatności.
          </p>
        </LegalSection>

        <LegalSection title="5. Pliki cookies i technologie śledzące">
          <p>
            Stosujemy niezbędne pliki cookies wymagane do działania serwisu.
            Możemy także używać analitycznych plików cookies, aby lepiej
            rozumieć, jak korzystasz z Stronka AI. Przed umieszczeniem
            jakichkolwiek opcjonalnych cookies poprosimy Cię o zgodę poprzez
            baner cookies. Możesz w każdej chwili wycofać zgodę lub zmienić
            preferencje za pomocą ustawień przeglądarki lub naszego panelu
            ustawień cookies.
          </p>
        </LegalSection>

        <LegalSection title="6. Zewnętrzni dostawcy usług">
          <p>
            Udostępniamy dane osobowe następującym kategoriom dostawców usług,
            z którymi łączą nas umowy powierzenia przetwarzania danych:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Dostawca hostingu
              </strong>{" "}
              — przechowywanie i serwowanie aplikacji.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dostawca płatności
              </strong>{" "}
              — obsługa rozliczeń i subskrypcji.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dostawca AI
              </strong>{" "}
              — generowanie treści zgodnie z punktem 4.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dostawca analityki
              </strong>{" "}
              — zbieranie zanonimizowanych danych o korzystaniu (jeśli
              dotyczy).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dostawca usługi email
              </strong>{" "}
              — dostarczanie wiadomości transakcyjnych i marketingowych.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="7. Międzynarodowe transfery danych">
          <p>
            Niektórzy nasi dostawcy usług mogą znajdować się poza Europejskim
            Obszarem Gospodarczym (EOG). W takich przypadkach zapewniamy
            odpowiednie zabezpieczenia, takie jak Standardowe klauzule umowne
            (SCC) zatwierdzone przez Komisję Europejską lub powołanie się na
            decyzję stwierdzającą odpowiedni stopień ochrony.
          </p>
        </LegalSection>

        <LegalSection title="8. Okres przechowywania danych">
          <p>
            Przechowujemy Twoje dane osobowe wyłącznie przez okres niezbędny
            do realizacji celów opisanych w niniejszej polityce. W
            szczególności:
          </p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane konta i treści:
              </strong>{" "}
              przechowywane przez czas trwania konta i usuwane w ciągu 30 dni
              od jego usunięcia.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dokumentacja rozliczeniowa:
              </strong>{" "}
              przechowywana zgodnie z polskimi przepisami podatkowymi (obecnie
              przez 5 lat).
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Dane o użytkowaniu i analityka:
              </strong>{" "}
              przechowywane w formie zanonimizowanej do 24 miesięcy.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="9. Twoje prawa zgodnie z RODO">
          <p>Jako osobie, której dane dotyczą, przysługuje Ci prawo do:</p>
          <LegalList>
            <li>
              <strong className="font-semibold text-gray-900">Dostępu</strong>{" "}
              do swoich danych osobowych i otrzymania ich kopii.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Sprostowania
              </strong>{" "}
              danych nieprawidłowych lub niekompletnych.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Usunięcia
              </strong>{" "}
              danych („prawo do bycia zapomnianym").
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Ograniczenia
              </strong>{" "}
              przetwarzania w określonych okolicznościach.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Przenoszenia danych
              </strong>{" "}
              — otrzymania danych w ustrukturyzowanym formacie nadającym się
              do odczytu maszynowego.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Sprzeciwu
              </strong>{" "}
              wobec przetwarzania opartego na prawnie uzasadnionym interesie.
            </li>
            <li>
              <strong className="font-semibold text-gray-900">
                Wycofania zgody
              </strong>{" "}
              w każdej chwili, bez wpływu na zgodność z prawem przetwarzania
              dokonanego przed jej wycofaniem.
            </li>
          </LegalList>
          <p>
            Aby skorzystać z dowolnego z tych praw, skontaktuj się z nami,
            korzystając z danych z punktu 12. Odpowiemy w ciągu 30 dni.
          </p>
        </LegalSection>

        <LegalSection title="10. Bezpieczeństwo danych">
          <p>
            Stosujemy odpowiednie środki techniczne i organizacyjne w celu
            ochrony Twoich danych osobowych, w tym szyfrowanie w transmisji
            (TLS), bezpieczne hashowanie haseł, kontrolę dostępu oraz
            regularne przeglądy bezpieczeństwa.
          </p>
        </LegalSection>

        <LegalSection title="11. Prywatność dzieci">
          <p>
            Stronka AI nie jest przeznaczony dla osób poniżej 16. roku
            życia. Nie zbieramy świadomie danych osobowych od dzieci. Jeśli
            dowiemy się, że dziecko przekazało nam swoje dane osobowe,
            niezwłocznie je usuniemy.
          </p>
        </LegalSection>

        <LegalSection title="12. Kontakt">
          <p>
            W sprawach związanych z niniejszą Polityką prywatności lub w celu
            skorzystania z przysługujących Ci praw skontaktuj się z nami:
          </p>
          <LegalContactCard>
            <p className="font-semibold text-gray-900">Stronka AI</p>
            <p>
              Email:{" "}
              <LegalLink href="mailto:privacy@stronkaai.com">
                privacy@stronkaai.com
              </LegalLink>
            </p>
            <p>Siedziba: Polska</p>
          </LegalContactCard>
          <p className="mt-4 text-xs text-gray-500">
            Przysługuje Ci również prawo do złożenia skargi do polskiego
            organu ochrony danych osobowych (UODO — Urząd Ochrony Danych
            Osobowych) lub innego właściwego organu nadzorczego w UE.
          </p>
        </LegalSection>

        <LegalSection title="13. Zmiany w polityce">
          <p>
            Możemy aktualizować niniejszą Politykę prywatności od czasu do
            czasu. W razie istotnych zmian poinformujemy Cię e-mailem lub
            poprzez wyraźne ogłoszenie w serwisie. Data „Ostatnia
            aktualizacja" na górze tej strony odzwierciedla najnowszą
            wersję.
          </p>
        </LegalSection>
      </div>
    </article>
  );
}
