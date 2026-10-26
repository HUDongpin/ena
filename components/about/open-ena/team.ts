// Maintained in ENA. Migrated from the former OPEN-ENA website.
export interface TeamMember {
  name: string;
  institution: string;
  role: string;
  bio: string;
  image: string;
  imageAlt: string;
  imagePosition?: string;
  profileUrl?: string;
  profileLabel?: string;
}

export const teamMembers: TeamMember[] = [
  {
    name: "Dr. Peter HU Dongpin",
    institution: "The Education University of Hong Kong",
    role: "Educational researcher · Application developer",
    bio: "His work spans technology-enhanced learning, learning analytics, artificial intelligence in education, network analysis, and content and language integrated learning.",
    image: "/open-ena-about/team/peter-hu-dongpin.png",
    imageAlt: "Portrait of Dr. Peter HU Dongpin",
    imagePosition: "center 24%",
    profileUrl: "https://repository.eduhk.hk/en/persons/dongpin-hu/",
    profileLabel: "EdUHK profile",
  },
  {
    name: "Prof. Eric Hamilton",
    institution: "Pepperdine University",
    role: "Jan and Robert Davidson Endowed Professor of Education and Technology",
    bio: "A learning scientist and technologist whose work connects technology innovation, global collaboration, and quantitative ethnography.",
    image: "/open-ena-about/team/eric-hamilton.png",
    imageAlt: "Portrait of Prof. Eric Hamilton",
    imagePosition: "center 24%",
    profileUrl: "https://gsep.pepperdine.edu/about/our-people/faculty/eric-hamilton/",
    profileLabel: "Pepperdine profile",
  },
  {
    name: "Ludwig Jianxing Yu",
    institution: "3D ENA Research Group · Hong Kong",
    role: "ENA variants · Dimensionality-reduction algorithms",
    bio: "He has played a pioneering role in advancing ENA variants such as 3D ENA and dimensionality-reduction algorithms for ENA. As the key developer of 3D ENA 1.0, he combines computer science and psychology to develop interactive research tools.",
    // Portrait and background from https://3dena.com/team.
    image: "/open-ena-about/team/ludwig-jianxing-yu.jpg",
    imageAlt: "Portrait of Ludwig Jianxing Yu",
    imagePosition: "center 24%",
    profileUrl: "https://3dena.com/team",
    profileLabel: "3D ENA team profile",
  },
  {
    name: "Prof. Sandy TU Yun-Fang",
    institution: "National Taiwan University of Science and Technology",
    role: "Assistant Professor · Graduate Institute of Digital Learning and Education",
    bio: "Her work spans artificial intelligence in digital learning, cognitive and social networks, data literacy, data visualization, and graph analysis.",
    image: "/open-ena-about/team/sandy-tu-yun-fang.jpg",
    imageAlt: "Portrait of Prof. Sandy TU Yun-Fang",
    imagePosition: "center 22%",
    profileUrl: "https://www.gidle.ntust.edu.tw/p/412-1006-3142.php?Lang=en",
    profileLabel: "Taiwan Tech profile",
  },
  {
    name: "Ms. Shirleen XU Qiaolin",
    institution: "Meredith College, North Carolina, USA",
    role: "Open ENA team",
    bio: "A member of the Open ENA team affiliated with Meredith College, North Carolina, USA.",
    image: "/open-ena-about/team/shirleen-xu-qiaolin.png",
    imageAlt: "Portrait of Ms. Shirleen XU Qiaolin",
    imagePosition: "center 26%",
  },
];
