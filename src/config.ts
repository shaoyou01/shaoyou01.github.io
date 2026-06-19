import type {
	AnnouncementConfig,
	CommentConfig,
	ExpressiveCodeConfig,
	FooterConfig,
	FullscreenWallpaperConfig,
	LicenseConfig,
	MusicPlayerConfig,
	NavBarConfig,
	PermalinkConfig,
	ProfileConfig,
	SakuraConfig,
	ShareConfig,
	SidebarLayoutConfig,
	SiteConfig,
} from "./types/config";

const SITE_LANG = "zh_CN";
const SITE_TIMEZONE = 8;

const bannerImages = {
	desktop: [
		"/assets/desktop-banner/1.webp",
		"/assets/desktop-banner/2.webp",
		"/assets/desktop-banner/4.webp",
		"/assets/desktop-banner/5.webp",
		"/assets/desktop-banner/6.webp",
	],
	mobile: [
		"/assets/mobile-banner/1.webp",
		"/assets/mobile-banner/2.webp",
		"/assets/mobile-banner/3.webp",
		"/assets/mobile-banner/4.webp",
		"/assets/mobile-banner/5.webp",
		"/assets/mobile-banner/6.webp",
	],
};

export const siteConfig: SiteConfig = {
	title: "shaoyou",
	subtitle: "Homepage and blogs.",
	siteURL: "https://shaoyou01.github.io/",
	siteStartDate: "2026-02-24",
	timeZone: SITE_TIMEZONE,
	lang: SITE_LANG,
	themeColor: {
		hue: 60,
		fixed: false,
	},
	featurePages: {
		anime: false,
		diary: false,
		friends: false,
		projects: false,
		skills: false,
		timeline: false,
		albums: false,
		devices: false,
	},
	navbarTitle: {
		mode: "text-icon",
		text: "shaoyou",
		icon: "assets/home/home.png",
		logo: "assets/home/default-logo.png",
	},
	pageScaling: {
		enable: true,
		targetWidth: 2000,
	},
	bangumi: {
		userId: "your-bangumi-id",
		fetchOnDev: false,
	},
	bilibili: {
		vmid: "your-bilibili-vmid",
		fetchOnDev: false,
		coverMirror: "",
		useWebp: true,
	},
	anime: {
		mode: "local",
	},
	postListLayout: {
		defaultMode: "list",
		allowSwitch: true,
	},
	tagStyle: {
		useNewStyle: false,
	},
	wallpaperMode: {
		defaultMode: "banner",
		showModeSwitchOnMobile: "desktop",
	},
	banner: {
		src: bannerImages,
		position: "center",
		carousel: {
			enable: true,
			interval: 1.5,
		},
		waves: {
			enable: true,
			performanceMode: false,
			mobileDisable: false,
		},
		imageApi: {
			enable: false,
			url: "",
		},
		homeText: {
			enable: true,
			title: "shaoyou",
			subtitle: ["Homepage and blogs."],
			typewriter: {
				enable: true,
				speed: 100,
				deleteSpeed: 50,
				pauseTime: 2000,
			},
		},
		credit: {
			enable: false,
			text: "",
			url: "",
		},
		navbar: {
			transparentMode: "semifull",
		},
	},
	toc: {
		enable: true,
		mode: "sidebar",
		depth: 2,
		useJapaneseBadge: true,
	},
	showCoverInContent: true,
	generateOgImages: false,
	favicon: [],
	font: {
		asciiFont: {
			fontFamily: "ZenMaruGothic-Medium",
			fontWeight: "400",
			localFonts: ["ZenMaruGothic-Medium.ttf"],
			enableCompress: true,
		},
		cjkFont: {
			fontFamily: "Loli",
			fontWeight: "500",
			localFonts: ["萝莉体 第二版.ttf"],
			enableCompress: true,
		},
	},
	showLastModified: true,
};

export const fullscreenWallpaperConfig: FullscreenWallpaperConfig = {
	src: bannerImages,
	position: "center",
	carousel: {
		enable: true,
		interval: 5,
	},
	zIndex: -1,
	opacity: 0.8,
	blur: 1,
};

export const navBarConfig: NavBarConfig = {
	links: [
		{
			name: "homepage",
			url: "/",
			icon: "material-symbols:home-rounded",
		},
		{
			name: "blogs",
			url: "/blogs/",
			icon: "material-symbols:article-rounded",
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar.webp",
	name: "shaoyou",
	bio: "Data-centric AI / Code agents / Code security",
	typewriter: {
		enable: true,
		speed: 80,
	},
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/shaoyou01",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const permalinkConfig: PermalinkConfig = {
	enable: false,
	format: "%postname%",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
	hideDuringThemeTransition: true,
};

export const commentConfig: CommentConfig = {
	enable: false,
	twikoo: {
		envId: "https://twikoo.vercel.app",
		lang: SITE_LANG,
	},
};

export const shareConfig: ShareConfig = {
	enable: true,
};

export const announcementConfig: AnnouncementConfig = {
	title: "",
	content: "Welcome to shaoyou.",
	closable: true,
	link: {
		enable: true,
		text: "Read blogs",
		url: "/blogs/",
		external: false,
	},
};

export const musicPlayerConfig: MusicPlayerConfig = {
	enable: false,
	mode: "meting",
	meting_api:
		"https://meting.mysqil.com/api?server=:server&type=:type&id=:id&auth=:auth&r=:r",
	id: "",
	server: "netease",
	type: "playlist",
};

export const footerConfig: FooterConfig = {
	enable: false,
	customHtml: "",
};

export const sidebarLayoutConfig: SidebarLayoutConfig = {
	properties: [
		{
			type: "profile",
			position: "top",
			class: "onload-animation",
			animationDelay: 0,
		},
		{
			type: "announcement",
			position: "top",
			class: "onload-animation",
			animationDelay: 50,
		},
		{
			type: "categories",
			position: "sticky",
			class: "onload-animation",
			animationDelay: 150,
			responsive: {
				collapseThreshold: 5,
			},
		},
		{
			type: "tags",
			position: "top",
			class: "onload-animation",
			animationDelay: 250,
			responsive: {
				collapseThreshold: 20,
			},
		},
	],
	components: {
		left: ["profile", "announcement", "categories", "tags"],
		right: [],
		drawer: ["profile", "announcement", "categories", "tags"],
	},
	defaultAnimation: {
		enable: true,
		baseDelay: 0,
		increment: 50,
	},
	responsive: {
		breakpoints: {
			mobile: 768,
			tablet: 1280,
			desktop: 1280,
		},
	},
};

export const sakuraConfig: SakuraConfig = {
	enable: false,
	sakuraNum: 21,
	limitTimes: -1,
	size: {
		min: 0.5,
		max: 1.1,
	},
	opacity: {
		min: 0.3,
		max: 0.9,
	},
	speed: {
		horizontal: {
			min: -1.7,
			max: -1.2,
		},
		vertical: {
			min: 1.5,
			max: 2.2,
		},
		rotation: 0.03,
		fadeSpeed: 0.03,
	},
	zIndex: 100,
};

export const pioConfig: import("./types/config").PioConfig = {
	enable: false,
	models: ["/pio/models/pio/model.json"],
	position: "left",
	width: 280,
	height: 250,
	mode: "draggable",
	hiddenOnMobile: true,
	dialog: {
		welcome: "Welcome to shaoyou.",
		touch: ["Hello."],
		home: "Back home.",
		skin: ["Change outfit?", "Looks good."],
		close: "See you.",
		link: "https://github.com/shaoyou01",
	},
};

export const widgetConfigs = {
	profile: profileConfig,
	announcement: announcementConfig,
	music: musicPlayerConfig,
	layout: sidebarLayoutConfig,
	sakura: sakuraConfig,
	fullscreenWallpaper: fullscreenWallpaperConfig,
	pio: pioConfig,
	share: shareConfig,
} as const;
