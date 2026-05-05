import {
  LegalContactCard,
  LegalHighlight,
  LegalLink,
  LegalList,
  LegalPageHeader,
  LegalSection,
} from "../_components";
import { LegalDraftBanner } from "../_draft-banner";

export default function TermsPagePl() {
  return (
    <article>
      <LegalDraftBanner />

      <LegalPageHeader
        title="Warunki korzystania"
        lastUpdated="25 kwietnia 2026"
      />

      <LegalHighlight>
        Niniejsze Warunki korzystania („Warunki") regulują Twój dostęp do
        platformy Stronka AI oraz korzystanie z niej. Zakładając konto lub
        korzystając z naszej usługi, zgadzasz się przestrzegać niniejszych
        Warunków. Jeśli nie zgadzasz się z nimi, prosimy nie korzystać z
        usługi.
      </LegalHighlight>

      <div className="space-y-10">
        <LegalSection title="1. Definicje">
          <p>
            <strong className="font-semibold text-gray-900">
              „Usługa"
            </strong>{" "}
            oznacza aplikację internetową Stronka AI wraz ze wszystkimi
            funkcjami, narzędziami oraz możliwościami generowania treści.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              „Użytkownik", „Ty", „Twój"
            </strong>{" "}
            oznacza każdą osobę fizyczną lub podmiot, który zakłada konto lub
            korzysta z Usługi.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              „My", „nas", „nasze"
            </strong>{" "}
            oznacza Stronka AI, firmę z siedzibą w Polsce.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              „Treści Użytkownika"
            </strong>{" "}
            oznacza wszelkie teksty, obrazy, projekty, landing page'y oraz
            inne materiały tworzone, przesyłane lub generowane przez Ciebie
            za pomocą Usługi.
          </p>
        </LegalSection>

        <LegalSection title="2. Wymagania">
          <p>
            Aby korzystać z Stronka AI, musisz mieć ukończone co najmniej
            16 lat. Korzystając z Usługi, oświadczasz, że spełniasz ten
            wymóg i masz zdolność prawną do zawarcia niniejszych Warunków.
          </p>
        </LegalSection>

        <LegalSection title="3. Twoje konto">
          <p>
            Odpowiadasz za zachowanie poufności danych logowania do swojego
            konta oraz za wszystkie działania wykonywane na Twoim koncie.
            Zobowiązujesz się do niezwłocznego informowania nas o każdym
            nieautoryzowanym dostępie. Zastrzegamy sobie prawo do zawieszenia
            lub usunięcia kont naruszających niniejsze Warunki.
          </p>
        </LegalSection>

        <LegalSection title="4. Dozwolone korzystanie">
          <p>Zobowiązujesz się nie używać Usługi do:</p>
          <LegalList>
            <li>Naruszania jakichkolwiek przepisów prawa.</li>
            <li>
              Tworzenia treści zniesławiających, oszukańczych, wprowadzających
              w błąd lub szkodliwych.
            </li>
            <li>
              Generowania stron phishingowych, oszukańczych witryn lub
              jakichkolwiek treści mających na celu wprowadzenie w błąd
              innych osób.
            </li>
            <li>
              Naruszania praw własności intelektualnej osób trzecich.
            </li>
            <li>
              Rozpowszechniania złośliwego oprogramowania, spamu lub innych
              szkodliwych treści.
            </li>
            <li>
              Prób inżynierii wstecznej, wykorzystywania luk lub zakłócania
              infrastruktury Usługi.
            </li>
            <li>
              Odsprzedaży, sublicencjonowania lub redystrybucji Usługi bez
              naszej pisemnej zgody.
            </li>
          </LegalList>
          <p>
            Zastrzegamy sobie prawo do usunięcia dowolnych treści oraz
            zawieszenia lub usunięcia każdego konta naruszającego niniejszą
            sekcję, według naszego wyłącznego uznania.
          </p>
        </LegalSection>

        <LegalSection title="5. Treści generowane przez AI">
          <p>
            Stronka AI wykorzystuje sztuczną inteligencję, aby pomóc Ci
            w tworzeniu landing page'y. Przyjmujesz do wiadomości, że:
          </p>
          <LegalList>
            <li>
              Treści generowane przez AI mogą nie zawsze być dokładne,
              kompletne lub odpowiednie dla Twoich potrzeb. Ponosisz
              odpowiedzialność za sprawdzenie i edycję wszystkich
              wygenerowanych treści przed publikacją.
            </li>
            <li>
              Nie gwarantujemy, że treści generowane przez AI są wolne od
              błędów ani że nie będą podobne do treści tworzonych dla innych
              użytkowników.
            </li>
            <li>
              Ponosisz wyłączną odpowiedzialność za zapewnienie, że
              publikowane przez Ciebie treści są zgodne z obowiązującymi
              przepisami, w tym z regulacjami dotyczącymi reklamy, prawami
              własności intelektualnej oraz standardami ochrony konsumentów.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="6. Własność intelektualna">
          <p>
            <strong className="font-semibold text-gray-900">
              Twoje treści:
            </strong>{" "}
            zachowujesz pełne prawa do Treści Użytkownika tworzonych za pomocą
            Stronka AI. Korzystając z Usługi, udzielasz nam ograniczonej,
            niewyłącznej licencji na hostowanie, przechowywanie i wyświetlanie
            Twoich Treści Użytkownika wyłącznie w celu świadczenia Usługi.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">
              Nasza platforma:
            </strong>{" "}
            wszelkie prawa do samej Usługi — w tym do jej projektu, kodu,
            modeli AI (na zasadach licencji udzielonej nam), marki oraz
            dokumentacji — pozostają przy Stronka AI. Niniejsze Warunki
            nie udzielają Ci żadnych praw do naszych znaków towarowych, logo
            ani innych elementów marki.
          </p>
        </LegalSection>

        <LegalSection title="7. Subskrypcje i płatności">
          <p>
            Stronka AI oferuje płatne plany subskrypcyjne. Subskrybując
            usługę, akceptujesz następujące zasady:
          </p>
          <LegalList>
            <li>
              Opłaty subskrypcyjne są pobierane z góry w okresach cyklicznych
              (miesięcznie lub rocznie, zależnie od planu).
            </li>
            <li>
              Wszystkie opłaty wyrażone są w euro (€) i obejmują obowiązujące
              podatki, o ile nie zaznaczono inaczej.
            </li>
            <li>
              Możesz w dowolnej chwili anulować subskrypcję. Anulacja zaczyna
              obowiązywać po zakończeniu bieżącego okresu rozliczeniowego.
              Nie zwracamy częściowych opłat za niewykorzystany czas.
            </li>
            <li>
              Zastrzegamy sobie prawo do zmiany cen z co najmniej 30-dniowym
              wyprzedzeniem. Dalsze korzystanie z Usługi po zmianie ceny
              oznacza akceptację nowej ceny.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="8. Kredyty i limity korzystania">
          <p>
            Niektóre funkcje Usługi (takie jak generowanie treści przez AI)
            podlegają systemowi kredytowemu. Kredyty są przyznawane na
            podstawie Twojego planu subskrypcji. Niewykorzystane kredyty nie
            przechodzą na kolejny okres rozliczeniowy, chyba że zostanie
            wskazane inaczej. Zastrzegamy sobie prawo do dostosowania
            przyznawanych kredytów z odpowiednim wyprzedzeniem.
          </p>
        </LegalSection>

        <LegalSection title="9. Dostępność i wsparcie">
          <p>
            Dążymy do tego, aby Stronka AI był dostępny przez cały czas,
            ale nie gwarantujemy nieprzerwanego dostępu. Usługa może być
            tymczasowo niedostępna z powodu prac konserwacyjnych, aktualizacji
            lub okoliczności od nas niezależnych. Dołożymy starań, aby z
            wyprzedzeniem informować o planowanych przerwach.
          </p>
        </LegalSection>

        <LegalSection title="10. Ograniczenie odpowiedzialności">
          <p>
            W maksymalnym zakresie dozwolonym przez obowiązujące prawo:
          </p>
          <LegalList>
            <li>
              Stronka AI jest dostarczany w stanie „takim, jaki jest" i
              „w miarę dostępności", bez jakichkolwiek gwarancji, wyraźnych
              ani dorozumianych.
            </li>
            <li>
              Nie ponosimy odpowiedzialności za jakiekolwiek szkody pośrednie,
              uboczne, szczególne, następcze lub karne, w tym utracone zyski,
              utracone przychody lub utratę danych.
            </li>
            <li>
              Nasza łączna odpowiedzialność wobec Ciebie z tytułu wszelkich
              roszczeń wynikających z Usługi lub z nią związanych nie
              przekroczy łącznej kwoty zapłaconej przez Ciebie w ciągu 12
              miesięcy poprzedzających roszczenie.
            </li>
          </LegalList>
          <p>
            Nic w niniejszych Warunkach nie wyłącza ani nie ogranicza
            odpowiedzialności, której nie można wyłączyć ani ograniczyć
            zgodnie z obowiązującym prawem, w tym odpowiedzialności za
            oszustwo lub winę umyślną.
          </p>
        </LegalSection>

        <LegalSection title="11. Zwolnienie z odpowiedzialności">
          <p>
            Zobowiązujesz się zwolnić Stronka AI oraz jego podmioty
            powiązane, członków organów i pracowników z wszelkich roszczeń,
            szkód, strat lub kosztów (w tym uzasadnionych kosztów obsługi
            prawnej) wynikających z korzystania przez Ciebie z Usługi, z
            Twoich Treści Użytkownika lub z naruszenia przez Ciebie
            niniejszych Warunków.
          </p>
        </LegalSection>

        <LegalSection title="12. Rozwiązanie umowy">
          <p>
            Każda ze stron może w dowolnej chwili rozwiązać niniejsze
            Warunki. Możesz to zrobić, usuwając swoje konto lub kontaktując
            się z nami. Możemy natychmiast rozwiązać lub zawiesić Twój dostęp
            w razie naruszenia niniejszych Warunków. Po rozwiązaniu Twoje
            prawo do korzystania z Usługi wygasa. Usuniemy dane Twojego konta
            w ciągu 30 dni, z wyjątkiem przypadków, w których przepisy
            wymagają ich przechowywania.
          </p>
        </LegalSection>

        <LegalSection title="13. Prawo właściwe i rozstrzyganie sporów">
          <p>
            Niniejsze Warunki podlegają prawu Rzeczypospolitej Polskiej i
            zgodnie z nim są interpretowane. Wszelkie spory wynikające z
            niniejszych Warunków będą rozstrzygane przez właściwe sądy w
            Polsce. Jeśli jesteś konsumentem w UE, zachowujesz prawo do
            wszczęcia postępowania w sądach swojego kraju zamieszkania oraz
            do korzystania z bezwzględnie obowiązujących przepisów ochrony
            konsumentów lokalnego prawa.
          </p>
          <p>
            Możesz również skorzystać z platformy internetowego rozstrzygania
            sporów (ODR) Komisji Europejskiej dostępnej pod adresem{" "}
            <LegalLink href="https://ec.europa.eu/consumers/odr">
              ec.europa.eu/consumers/odr
            </LegalLink>
            .
          </p>
        </LegalSection>

        <LegalSection title="14. Zmiany niniejszych Warunków">
          <p>
            Możemy w dowolnym czasie modyfikować niniejsze Warunki. W razie
            istotnych zmian poinformujemy Cię e-mailem lub poprzez wyraźne
            ogłoszenie w Usłudze co najmniej 14 dni przed wejściem zmian w
            życie. Dalsze korzystanie z Usługi po wejściu zmian w życie
            stanowi akceptację zaktualizowanych Warunków.
          </p>
        </LegalSection>

        <LegalSection title="15. Klauzula salwatoryjna">
          <p>
            Jeśli którekolwiek postanowienie niniejszych Warunków zostanie
            uznane za niewykonalne, pozostałe postanowienia zachowują pełną
            moc i skuteczność.
          </p>
        </LegalSection>

        <LegalSection title="16. Kontakt">
          <p>
            W sprawach związanych z niniejszymi Warunkami skontaktuj się z
            nami pod adresem:
          </p>
          <LegalContactCard>
            <p className="font-semibold text-gray-900">Stronka AI</p>
            <p>
              Email:{" "}
              <LegalLink href="mailto:hello@stronkaai.com">
                hello@stronkaai.com
              </LegalLink>
            </p>
            <p>Siedziba: Polska</p>
          </LegalContactCard>
        </LegalSection>
      </div>
    </article>
  );
}
