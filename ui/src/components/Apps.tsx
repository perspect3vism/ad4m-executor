import { useState, useContext, useEffect } from "preact/compat";
import { Ad4minContext } from "../context/Ad4minContext";
import { cardStyle, linkStyle, listStyle } from "./styles";
import { open } from "@tauri-apps/api/shell";

const Apps = () => {
  const {
    state: { client },
  } = useContext(Ad4minContext);

  const [apps, setApps] = useState<any[] | null[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState("");

  const getApps = async () => {
    const apps = await client!.agent.getApps();

    const newApps: any = {};

    for (const app of apps) {
      if (newApps[app.auth.appUrl]) {
        newApps[app.auth.appUrl].token.push({
          revoked: app.revoked,
          requestId: app.requestId,
        });
      } else {
        newApps[app.auth.appUrl] = {
          ...app,
          token: [
            {
              revoked: app.revoked,
              requestId: app.requestId,
            },
          ],
        };
      }
    }

    setApps(Object.values(newApps));
  };

  const removeApps = async (appUrl: string) => {
    const app = apps.find((a: any) => a.auth.appUrl === appUrl);
    for (const token of app.token) {
      await client!.agent.removeApp(token.requestId);
    }

    await getApps();

    setShowModal(false);
  };

  const revokeToken = async (appUrl: string) => {
    const app = apps.find((a: any) => a.auth.appUrl === appUrl);
    for (const token of app.token) {
      await client!.agent.revokeToken(token.requestId);
    }

    await getApps();

    setShowModal(false);
  };

  useEffect(() => {
    getApps();

    client?.agent?.addAppChangedListener(() => {
      console.log("triggered");
      getApps();
    });
  }, [client]);

  function goToFlux() {
    open("https://app.fluxsocial.io");
  }

  return (
    <div>
      {apps.length === 0 ? (
        <j-box pt="1000" px="800">
          <j-flex gap="400" direction="column" a="center" j="center">
            <j-icon color="ui-500" size="xl" name="window-stack"></j-icon>
            <j-flex direction="column" gap="300" j="center" a="center">
              <j-text nomargin color="black" size="700" weight="800">
                No connected apps yet
              </j-text>
              <j-text align="center" weight="300" size="500" color="ui-500">
                Apps that have access to your social data will appear here. You
                can revoke access at any time.
              </j-text>
              <j-button onClick={goToFlux} variant="primary">
                Try Flux
              </j-button>
            </j-flex>
          </j-flex>
        </j-box>
      ) : (
        <div style={{ ...listStyle }}>
          {apps.map((app, index) => (
            <div key={`app-${index}`} style={{ ...cardStyle, width: "100%" }}>
              <j-flex gap="500">
                <div>
                  <j-avatar size="lg" src={app.auth.appIconPath}></j-avatar>
                </div>
                <div>
                  <j-text variant="heading-sm" size="600">
                    {app.auth.appName}
                    &nbsp;&nbsp;
                    {app.revoked && (
                      <j-badge variant="warning">revoked</j-badge>
                    )}
                  </j-text>
                  <j-text size="400">{app.auth.appDesc}</j-text>
                  <a
                    style={{ ...linkStyle }}
                    href={app.auth.appUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {app.auth.appUrl}
                  </a>
                </div>
              </j-flex>
              <div style={{ position: "absolute", top: 0, right: 0 }}>
                <j-button
                  variant="link"
                  onClick={() => {
                    setShowModal(true);
                    setSelectedRequestId(app.auth.appUrl);
                  }}
                >
                  <j-icon name="x" />
                </j-button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <j-modal
          size="fullscreen"
          open={showModal}
          onToggle={(e: any) => setShowModal(e.target.open)}
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                App actions
              </j-text>
            </j-box>
            <j-text>
              Warning: You can either revoke the apps token which will make sure
              the app using it doesn't have access to your data but the apps
              stays in the list or remove the app completely.
            </j-text>
            <j-box p="200"></j-box>
            <j-box p="200"></j-box>
            <j-flex>
              {!apps.find((app) => app.auth.appUrl === selectedRequestId)
                .revoked && (
                <>
                  <j-button
                    variant="primary"
                    onClick={() => revokeToken(selectedRequestId)}
                  >
                    Revoke Token
                  </j-button>
                  <j-box px="400"></j-box>
                </>
              )}
              <j-button
                variant="primary"
                onClick={() => removeApps(selectedRequestId)}
              >
                Remove App
              </j-button>
            </j-flex>
          </j-box>
        </j-modal>
      )}
    </div>
  );
};

export default Apps;
