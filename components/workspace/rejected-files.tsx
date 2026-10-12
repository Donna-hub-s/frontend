/** Un fichier que le serveur n'a pas pris, avec la raison qu'il en donne (scan sans texte, PDF protégé, type inconnu…). */
export type RejectedFile = { name: string; reason?: string };

/**
 * La liste des fichiers refusés à l'envoi. Le serveur dit POURQUOI chacun l'est (`errors[].detail`, écrit pour être montré) :
 * n'afficher que les noms laissait l'utilisateur deviner — « il refuse certains PDF » — alors que la plupart des refus ont
 * une action simple (passer un scan par un OCR, retirer le mot de passe).
 */
export function RejectedFiles({ intro, files }: { intro: string; files: RejectedFile[] }) {
  return (
    <>
      <span>{intro}</span>
      <ul className="mt-1 flex flex-col gap-1">
        {files.map((file, index) => (
          <li key={`${index}-${file.name}`} className="text-pretty">
            <span className="font-medium">{file.name}</span>
            {file.reason ? <> — {file.reason}</> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
