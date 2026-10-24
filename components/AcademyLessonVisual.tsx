import Image from "next/image";
import { getAcademyCover } from "@/lib/academy-covers";

interface AcademyLessonVisualProps {
  lessonId: string;
  sizes: string;
  preload?: boolean;
}

export default function AcademyLessonVisual({ lessonId, sizes, preload = false }: AcademyLessonVisualProps) {
  const cover = getAcademyCover(lessonId);

  return (
    <div className="academy-lesson-visual" lang="en" dir="ltr">
      <Image
        src={cover.src}
        alt={cover.alt}
        width={cover.width}
        height={cover.height}
        sizes={sizes}
        preload={preload}
        loading={preload ? undefined : "lazy"}
      />
    </div>
  );
}
