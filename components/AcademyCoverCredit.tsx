import { getAcademyCover } from "@/lib/academy-covers";

export default function AcademyCoverCredit({
  lessonId,
  showCaption = false,
}: {
  lessonId: string;
  showCaption?: boolean;
}) {
  const cover = getAcademyCover(lessonId);
  return (
    <div className="academy-cover-credit" lang="en" dir="ltr">
      {showCaption ? <p className="academy-cover-caption">{cover.caption}</p> : null}
      <p>
        <a href={cover.sourceUrl} target="_blank" rel="noreferrer">{cover.credit}</a>
        {" · "}
        <a href={cover.licenseUrl} target="_blank" rel="noreferrer">{cover.license}</a>
        {showCaption ? (
          <>{" · "}<a href={cover.originalImageUrl} target="_blank" rel="noreferrer">View original image</a></>
        ) : null}
      </p>
      {showCaption ? <p className="academy-cover-note">Original tutorial illustration, resized with white padding.</p> : null}
    </div>
  );
}
