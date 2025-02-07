import { LanguageMeta } from "@coasys/ad4m";
import { useContext, useEffect, useState } from "react";
import { Ad4minContext } from "../context/Ad4minContext";
import { isSystemLanguage } from "../util";
import ActionButton from "./ActionButton";
import { cardStyle, listStyle } from "./styles";

type Props = {
  opened: boolean;
  setOpened: (val: boolean) => void;
};

const Language = (props: Props) => {
  const {
    state: { client },
  } = useContext(Ad4minContext);

  const [languages, setLanguages] = useState<any[] | null[]>([]);
  const [loading, setLoading] = useState(false);
  const [installLanguageModalOpen, setInstallLanguageModalOpen] =
    useState(false);
  const [publishLanguageModalOpen, setPublishLanguageModalOpen] =
    useState(false);
  const [publishLanguageResultModalOpen, setPublishLanguageResultModalOpen] =
    useState(false);
  const [publishLanguageResult, setPublishLanguageResult] =
    useState<LanguageMeta | null>(null);

  const [languageHash, setLanguageHash] = useState("");
  const [languageName, setLanguageName] = useState("");
  const [languageDescription, setLanguageDescription] = useState("");
  const [languageSourceLink, setLanguageSourceLink] = useState("");
  const [languageBundlePath, setLanguageBundlePath] = useState("");
  const [data, setData] = useState<any[]>([]);

  const publishLanguage = async () => {
    setLoading(true);
    if (languageBundlePath) {
      const installedLanguage = await client!.languages.publish(
        languageBundlePath,
        {
          name: languageName,
          description: languageDescription,
          possibleTemplateParams: data,
          sourceCodeLink: languageSourceLink,
        }
      );

      console.log(installedLanguage);

      setPublishLanguageModalOpen(false);

      setPublishLanguageResultModalOpen(true);

      setPublishLanguageResult(installedLanguage);
    } else {
      // TODO: Add popup Language file is missing
    }
    setLoading(false);
  };

  const installLanguage = async () => {
    setLoading(true);
    try {
      if (languageHash) {
        await client!.languages.byAddress(languageHash);

        await getLanguages();

        setInstallLanguageModalOpen(false);

        // TODO: Show notification: Language sucessfully installed
      } else {
        // TODO: Show notification: Language file missing
      }

      setLoading(false);
    } catch (e) {
      setLoading(false);
      throw e;
    }
  };

  const getLanguages = async () => {
    const langs = await client!.languages.all();

    const perspectives = await client!.perspective.all();

    const tempLangs = [];

    for (const lang of langs) {
      const found = perspectives.find((p) => {
        if (p.neighbourhood) {
          if (p.neighbourhood.linkLanguage === lang.address) {
            return true;
          } else {
            return p.neighbourhood.meta.links
              .filter((l) => l.data.predicate === "language")
              .find((l) => l.data.target === lang.address);
          }
        }

        return false;
      });

      tempLangs.push({ language: lang, perspective: found });
    }

    setLanguages(tempLangs);
  };

  useEffect(() => {
    getLanguages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <j-box px="500" py="500">
        <j-flex gap="300">
          <ActionButton
            title="Publish language"
            onClick={() => setPublishLanguageModalOpen(true)}
            icon="globe"
          />
          <ActionButton
            title="Install language"
            onClick={() => setInstallLanguageModalOpen(true)}
            icon="download"
          />
        </j-flex>
      </j-box>
      <div style={listStyle}>
        {languages.map((e, i) => {
          const { language, perspective } = e;
          const isSystem = isSystemLanguage(language!.name);

          return (
            <div
              key={`language-${language?.address}`}
              style={{ ...cardStyle, width: "100%" }}
            >
              <j-badge size="sm" variant={isSystem ? "success" : "primary"}>
                {isSystem ? "System" : "Installed"}
              </j-badge>

              <j-box pt="300" pb="400">
                <j-text variant="heading-sm">{language?.name}</j-text>
              </j-box>

              <j-box>
                <j-text variant="label" size="300">
                  Address
                </j-text>
                <j-input readonly value={language?.address}>
                  <j-button
                    slot="end"
                    size="xs"
                    variant="subtle"
                    onClick={() => console.log("wow")}
                  >
                    <j-icon size="xs" slot="end" name="clipboard"></j-icon>
                  </j-button>
                </j-input>
              </j-box>
            </div>
          );
        })}
      </div>
      {publishLanguageModalOpen && (
        <j-modal
          size="fullscreen"
          open={publishLanguageModalOpen}
          onToggle={(e: any) => setPublishLanguageModalOpen(e.target.open)}
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Publish Language
              </j-text>
            </j-box>
            <j-input
              label="Name"
              size="lg"
              placeholder="ex. Social-Context"
              value={languageName}
              onInput={(e: any) => setLanguageName(e.target.value)}
            ></j-input>
            <j-input
              label="Description"
              size="lg"
              placeholder="Describe what the language does here."
              value={languageDescription}
              onInput={(e: any) => setLanguageDescription(e.target.value)}
            ></j-input>
            <j-input
              label="Description"
              size="lg"
              placeholder="Describe what the language does here."
              value={languageDescription}
              onInput={(e: any) => setLanguageDescription(e.target.value)}
            ></j-input>
            <j-input
              label="Language Bundle Path"
              size="lg"
              placeholder="ex. dev/example/language.js"
              value={languageBundlePath}
              onInput={(e: any) => setLanguageBundlePath(e.target.value)}
            ></j-input>
            <j-box p="200"></j-box>
            <j-flex a="center" gap="200">
              <j-button
                variant="link"
                onClick={() => setPublishLanguageModalOpen(false)}
              >
                Cancel
              </j-button>
              <j-button
                variant="primary"
                onClick={publishLanguage}
                loading={loading}
              >
                Publish
              </j-button>
            </j-flex>
          </j-box>
        </j-modal>
      )}
      {installLanguageModalOpen && (
        <j-modal
          size="fullscreen"
          open={installLanguageModalOpen}
          onToggle={(e: any) => setInstallLanguageModalOpen(e.target.open)}
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Install Language
              </j-text>
            </j-box>
            <j-input
              label="Language hash"
              size="lg"
              placeholder="ex. QmUTkvPcyaUGntqfzi3iR1xomADm5yYC2j8hcPdhMHpTem"
              value={languageHash}
              onInput={(e: any) => setLanguageHash(e.target.value)}
            ></j-input>
            <j-box p="200"></j-box>
            <j-flex gap="200">
              <j-button
                variant="link"
                onClick={() => setInstallLanguageModalOpen(false)}
              >
                Cancel
              </j-button>
              <j-button
                variant="primary"
                onClick={installLanguage}
                loading={loading}
              >
                Install
              </j-button>
            </j-flex>
          </j-box>
        </j-modal>
      )}
      {publishLanguageResultModalOpen && (
        <j-modal
          size="fullscreen"
          open={publishLanguageResultModalOpen}
          onToggle={(e: any) =>
            setPublishLanguageResultModalOpen(e.target.open)
          }
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Install Language
              </j-text>
            </j-box>
            <j-text>Name: {publishLanguageResult?.name}</j-text>
            <j-text>Address: {publishLanguageResult?.address}</j-text>
            <j-text>Description: {publishLanguageResult?.description}</j-text>
            <j-text>Author: {publishLanguageResult?.author}</j-text>
            <j-text>
              Source code link: {publishLanguageResult?.sourceCodeLink}
            </j-text>

            <j-button onClick={() => setPublishLanguageResultModalOpen(false)}>
              Done
            </j-button>
          </j-box>
        </j-modal>
      )}
    </div>
  );
};

export default Language;
